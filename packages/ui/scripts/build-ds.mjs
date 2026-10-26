// Builds the design system page's bundle from this package's source:
//   ds/components/bundle.js   one classic script assigning window.Search (React from window.React)
//   ds/components/bundle.css  Tailwind base + the utilities the components use
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const root = new URL("../", import.meta.url).pathname;
const out = `${root}ds/components/`;
mkdirSync(out, { recursive: true });

// Point react, react-dom and the JSX runtime at the page's globals.
const globals = {
  name: "globals",
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({ path: args.path, namespace: "global" }));
    b.onLoad({ filter: /.*/, namespace: "global" }, (args) => {
      if (args.path === "react/jsx-runtime" || args.path === "react/jsx-dev-runtime") {
        return {
          contents: `const R = window.React; export const Fragment = R.Fragment;
            export function jsx(t, p, k) { const { children, ...rest } = p ?? {}; return R.createElement(t, k === undefined ? rest : { ...rest, key: k }, ...(Array.isArray(children) ? children : children === undefined ? [] : [children])); }
            export const jsxs = jsx; export const jsxDEV = jsx;`,
        };
      }
      const global = args.path.startsWith("react-dom") ? "ReactDOM" : "React";
      return { contents: `module.exports = window.${global};`, loader: "js" };
    });
  },
};

// The components the design system page lists, in its order. Helpers (ChipRow, Thumb, TileGrid…)
// are exported on window.Search too and documented with their parent component.
const names = [
  "Button", "IconButton", "SearchField", "Chip", "ProductTile", "PricePill", "Badge", "Verdict",
  "SegmentedControl", "ListGroup", "StoreIcon", "TextField", "AlertCard", "DropCard", "SectionHeader", "EmptyState", "TabBar", "Sheet",
];

const result = await build({
  entryPoints: [`${root}src/index.ts`],
  bundle: true,
  format: "iife",
  globalName: "__SearchKit",
  minify: true,
  write: false,
  target: "es2020",
  jsx: "automatic",
  plugins: [globals],
  define: { "process.env.NODE_ENV": '"production"' },
});
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: "Search", components: names.map((name) => ({ name })) })} */\n`;
let js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "\\x3C!--");
writeFileSync(`${out}bundle.js`, `${header}${js}\nwindow.Search = Object.assign(window.Search || {}, __SearchKit);\n`);

execFileSync("npx", ["@tailwindcss/cli", "-i", `${root}src/ds.css`, "-o", `${out}bundle.css`, "--minify"], { stdio: "inherit", cwd: root });
console.log("bundle:", names.join(", "));
