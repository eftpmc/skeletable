type Rule = { allow: boolean; pattern: string };

export type Robots = { sitemaps: string[]; rules: Rule[] };

/** The groups for `*` and our own bot. A crawler that honours them never reads a disallowed path. */
export function parseRobots(text: string, agent = "skeletonbot"): Robots {
  const sitemaps: string[] = [];
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === "sitemap") { if (value) sitemaps.push(value); continue; }
    if (key === "user-agent") {
      if (!current || current.rules.length) groups.push(current = { agents: [], rules: [] });
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && current) {
      // An empty Disallow allows everything.
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  return { sitemaps, rules: chosen.flatMap((g) => g.rules) };
}

/** Longest matching rule wins; Allow wins a tie. Supports `*` and a trailing `$`. */
export function robotsAllows(robots: Robots, url: string): boolean {
  const { pathname, search } = new URL(url);
  const path = pathname + search;
  let best: Rule | null = null;
  for (const rule of robots.rules) {
    const anchored = rule.pattern.endsWith("$");
    const body = rule.pattern.slice(0, anchored ? -1 : undefined).split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    if (!new RegExp(`^${body}${anchored ? "$" : ""}`).test(path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best?.allow ?? true;
}
