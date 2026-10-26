/**
 * Real ways people search, against store titles. `match` is whether the listing should be kept
 * (relevance at or above the cut). Add a row whenever a search misses or keeps the wrong thing.
 */
export const queryCases: { query: string; title: string; brand?: string; match: boolean }[] = [
  // Short model codes
  { query: "sony xm5", title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones", match: true },
  { query: "xm5", title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones", match: true },
  { query: "wh1000xm5", title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones", match: true },
  { query: "sony xm5 headphones", title: "Sony WH-1000XM5 Wireless Headphones", match: true },
  { query: "sony xm5", title: "Sony WH-1000XM4 Wireless Noise Canceling Headphones", match: false },
  { query: "990v6", title: "New Balance Made in USA 990v6 Grey", match: true },
  { query: "nb 990v6", title: "Made in USA 990v6 Grey", brand: "New Balance", match: true },
  { query: "new balance 990 v6", title: "NB 990v6 Grey Size 10", match: true },
  { query: "990v6", title: "New Balance Made in USA 990v5 Grey", match: false },
  { query: "mx master 3s", title: "Logitech MX Master 3S Performance Wireless Mouse", match: true },
  { query: "mx master 3s", title: "Logitech MX Master 3 Advanced Wireless Mouse", match: false },
  // Generations
  { query: "airpods pro 2", title: "Apple AirPods Pro (2nd Generation) with MagSafe Case", match: true },
  { query: "airpods pro 2nd gen", title: "Apple AirPods Pro 2 Wireless Earbuds", match: true },
  { query: "airpods pro 2", title: "Apple AirPods Pro 3", match: false },
  { query: "iphone 15 pro", title: "Apple iPhone 15 Pro 128GB Natural Titanium", match: true },
  { query: "iphone 15 pro", title: "Apple iPhone 14 Pro 128GB Deep Purple", match: false },
  // Nicknames
  { query: "ps5 slim", title: "PlayStation 5 Slim Console (Disc)", brand: "Sony", match: true },
  { query: "playstation 5", title: "Sony PS5 Console Slim Digital Edition", match: true },
  { query: "ps5", title: "PlayStation 4 Pro 1TB Console", match: false },
  { query: "af1 white", title: "Nike Air Force 1 '07 White", match: true },
  { query: "jordan 1 chicago", title: "Air Jordan 1 Retro High OG Chicago", match: true },
  // Plurals and sizes
  { query: "carhartt jackets", title: "Detroit Jacket", brand: "Carhartt WIP", match: true },
  { query: "nike pegasus 41 size 10", title: "Nike Pegasus 41 Men's Road Running Shoes", match: true },
  { query: "sony headphones", title: "Phone case", match: false },
];
