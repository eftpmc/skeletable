import { expect, it } from "vitest";
import { accountLinks } from "../src/lib/account";

it("links to your public profile by handle", () => {
  expect(accountLinks("zack").map((link) => link.href)).toEqual(["/", "/zack", "/settings"]);
});

it("leaves out the profile until there's a handle", () => {
  expect(accountLinks(null).map((link) => link.href)).toEqual(["/", "/settings"]);
});
