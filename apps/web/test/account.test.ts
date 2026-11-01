import { expect, it } from "vitest";
import { accountLinks } from "../src/lib/account";

it("links to your public profile by handle", () => {
  expect(accountLinks("zack").map((link) => link.href)).toEqual(["/", "/zack", "/settings/teams", "/settings"]);
});

it("leaves out the profile until there's a handle", () => {
  expect(accountLinks(null).map((link) => link.href)).toEqual(["/", "/settings/teams", "/settings"]);
});

it("lists the teams you're on by name, and says when an invite is waiting", () => {
  const links = accountLinks("zack", [{ handle: "skeletable", name: "Skeletable", role: "owner" }], 2);
  expect(links.map((link) => link.label)).toEqual(["Your tables", "Public profile", "Skeletable", "Teams (2 invites)", "Settings"]);
});
