/** Starting points for an empty search: a few categories, and one that shows secondhand first. */
export const shortcuts = [
  { label: "Sneakers", q: "sneakers" },
  { label: "Headphones", q: "headphones" },
  { label: "Tech", q: "laptop" },
  { label: "Home", q: "sofa" },
  { label: "Used & refurb", q: "iphone", condition: "used" },
];

export const shortcutHref = (s: (typeof shortcuts)[number]) =>
  `/search?q=${encodeURIComponent(s.q)}${s.condition ? `&condition=${s.condition}` : ""}`;
