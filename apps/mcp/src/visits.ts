// Who's reading, by kind only. No address or identity is kept, just a daily count per name.

const crawlers: [RegExp, string][] = [
  [/OAI-SearchBot/i, "oai-search"],
  [/ChatGPT-User/i, "chatgpt-user"],
  [/GPTBot/i, "gptbot"],
  [/Claude-User/i, "claude-user"],
  [/Claude-SearchBot/i, "claude-search"],
  [/ClaudeBot/i, "claudebot"],
  [/Perplexity-User/i, "perplexity-user"],
  [/PerplexityBot/i, "perplexitybot"],
  [/Google-Extended/i, "google-extended"],
  [/Googlebot/i, "googlebot"],
  [/bingbot/i, "bingbot"],
  [/Applebot/i, "applebot"],
  [/Amazonbot/i, "amazonbot"],
  [/meta-externalagent/i, "meta"],
  [/CCBot/i, "ccbot"],
  [/Bytespider/i, "bytespider"],
];

const answerEngines: [RegExp, string][] = [
  [/(^|\.)chatgpt\.com$/, "chatgpt"],
  [/(^|\.)perplexity\.ai$/, "perplexity"],
  [/(^|\.)claude\.ai$/, "claude"],
  [/^gemini\.google\.com$/, "gemini"],
  [/^copilot\.microsoft\.com$/, "copilot"],
];

const referrerHost = (referrer: string) => {
  try {
    return new URL(referrer).hostname;
  } catch {
    return "";
  }
};

/** The daily counts a request adds to. Crawlers are counted apart, so `page` stays about people. */
export function visitNames(path: string, userAgent = "", referrer = "") {
  if (path.startsWith("/assets/") || path === "/health") return [];
  const crawler = crawlers.find(([pattern]) => pattern.test(userAgent));
  if (crawler) return [`bot:${crawler[1]}`];
  if (path === "/mcp") return ["mcp"];
  if (path.startsWith("/api/")) return [];
  const host = referrerHost(referrer);
  const engine = answerEngines.find(([pattern]) => pattern.test(host));
  return engine ? ["page", `from:${engine[1]}`] : ["page"];
}
