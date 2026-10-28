// Reading other people's sites, safely and politely: the fetcher that refuses private addresses,
// robots.txt and sitemaps, a store's open/closed state, the polite pace every crawl keeps, and the
// readers that turn a site into readings (platforms first, then structured data, then recipes).
export * from "./safe-fetch.js";
export * from "./storefront.js";
export * from "./sitemap.js";
export * from "./polite.js";
export * from "./readers/index.js";
export * from "./recipes.js";
export * from "./reviewed-recipes.js";
