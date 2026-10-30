import type { HTMLElement } from "node-html-parser";

/** Read only properties owned by a schema.org scope, excluding nested recommendations. */
export function microdataProducts(root: HTMLElement): Record<string, unknown>[] {
  const read = (scope: HTMLElement, depth = 0): Record<string, unknown> => {
    const output: Record<string, unknown> = { "@type": scope.getAttribute("itemtype")?.split(/\s+/).map((s) => s.replace(/^.*[/#]/, "")) };
    if (depth > 5) return output;
    for (const element of scope.querySelectorAll("[itemprop]").slice(0, 2000)) {
      let owner = element.parentNode;
      while (owner && owner !== scope && !owner.hasAttribute("itemscope")) owner = owner.parentNode;
      if (owner !== scope) continue;
      const value = element.hasAttribute("itemscope") ? read(element, depth + 1)
        : element.getAttribute("content") ?? element.getAttribute("href") ?? element.getAttribute("src") ?? element.text.trim();
      for (const key of (element.getAttribute("itemprop") ?? "").split(/\s+/)) {
        if (!key || ["__proto__", "constructor", "prototype"].includes(key)) continue;
        const previous = output[key];
        output[key] = previous === undefined ? value : Array.isArray(previous) ? [...previous, value] : [previous, value];
      }
    }
    return output;
  };
  const products = root.querySelectorAll("[itemscope][itemtype]")
    .filter((node) => /https?:\/\/schema\.org\/(Product|ProductGroup)(?:\s|$)/.test(node.getAttribute("itemtype") ?? ""))
    .slice(0, 500).map((node) => read(node));
  // Some merchants omit itemscope entirely. Require explicit product metadata,
  // then retain only unique, unscoped properties; repeated prices are ambiguous.
  if (!products.length && root.querySelector('meta[property="og:type"]')?.getAttribute("content") === "product") {
    const loose = read(root);
    for (const [key, value] of Object.entries(loose)) if (Array.isArray(value)) delete loose[key];
    loose["@type"] = "Product";
    products.push(loose);
  }
  return products;
}
