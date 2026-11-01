import { expect, it } from "vitest";
import { findQuotes, type Fetcher } from "../src/index.js";

const page = (body: string, contentType = "text/html", status = 200): Fetcher => async () => ({ status, contentType, body });
const html = `<html><head><title>120 Hz</title><script>const x = 640;</script></head><body>
  <h1>The handheld</h1>
  <p>Reduced total system weight to 640 g. It lasts for hours.</p>
  <ul><li>Refresh rate: 90 Hz</li><li>Weight of the dock: 1640 g</li></ul>
</body></html>`;

it("offers whole sentences that state a number, in the page's own capitals", async () => {
  expect(await findQuotes("https://a.example/", 640, page(html))).toEqual({ quotes: ["Reduced total system weight to 640 g."] });
});

it("offers sentences that hold every word of a text value", async () => {
  expect(await findQuotes("https://a.example/", "90 Hz", page(html))).toEqual({ quotes: ["Refresh rate: 90 Hz"] });
});

it("cuts a long sentence around the value, and keeps the value in it", async () => {
  const sentence = `${"word ".repeat(200)}weighs 640 g ${"word ".repeat(200)}`;
  const { quotes } = await findQuotes("https://a.example/", 640, page(`<p>${sentence}</p>`));
  expect(quotes[0]!.length).toBeLessThanOrEqual(400);
  expect(quotes[0]).toContain("weighs 640 g");
});

it("says when it couldn't look", async () => {
  expect(await findQuotes("https://a.example/", 640, page("", "", 451))).toEqual({ quotes: [], blocked: "robots" });
  expect(await findQuotes("https://a.example/", 640, page("", "text/html", 403))).toEqual({ quotes: [], blocked: "unreadable" });
  expect(await findQuotes("https://a.example/", 640, async () => { throw new Error("no"); })).toEqual({ quotes: [], blocked: "unreadable" });
});

it("leaves a yes or no to the person, since a sentence's meaning shows that", async () => {
  expect(await findQuotes("https://a.example/", true, page(html))).toEqual({ quotes: [] });
});
