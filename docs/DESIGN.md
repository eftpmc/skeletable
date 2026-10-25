# Design Doc — working name: "Closet"

> Status: draft v0.1 · Owner: Zack · Last updated: 2026-10-25
> The name is a placeholder. Everything here is open to change.

## 1. Summary

A clean, minimal app that combines **your closet** with **a feed that learns your taste**. It feels like Shop and Pinterest, not like a spreadsheet.

It solves two problems:

1. **"I don't know where to look."** A visual discovery feed built from the brands you follow and the things you save, tuned to what you already own and wear.
2. **"I don't know what I have / what goes together."** A good-looking digital closet with outfits, boards and wear stats.

It runs in **our cloud** (sign up and go) or **self-hosted** (`docker compose up`). The same apps work with both.
AI runs **behind the scenes** for tagging, cutouts and recommendations. **Chat** happens in the user's own assistant (Claude, ChatGPT, …) through **MCP**.

## 2. Principles

1. **Clean and minimal.** Few tabs, few buttons, lots of whitespace, photos first. If a screen needs a tutorial, redesign it.
2. **Adding clothes must be effortless.** Wardrobe apps die at data entry. Every way in (link, photo, chat, order email) should take seconds.
3. **AI is a tool, not a feature.** No chat box in the app. AI fills in tags, removes backgrounds and ranks the feed. The user confirms and moves on.
4. **Works without AI.** A self-hosted instance with AI turned off is still a complete, useful closet.
5. **Your data is yours.** Full export at any time. Self-hosting is a first-class option, not an afterthought.
6. **Discovery is earned, not pushed.** The feed comes from brands you follow and things you save. No ads in the feed.

## 3. Target user

Starting persona: **a 20-something who wants to dress better but doesn't know which brands fit their style or where to shop**. They save outfits they see online but never act on them, and own clothes they forget about.

Later: anyone who likes clothes, plus the self-hosting crowd (Immich / Jellyfin users), who want a private closet app.

## 4. Product

### 4.1 Navigation — three tabs

| Tab | Purpose |
|---|---|
| **Discover** | Masonry feed with search at the top: products from followed brands, "more like your saves", gap fillers |
| **Closet** | What you own, shown as clean product cards. A segmented control at the top switches **Items · Outfits** |
| **Saved** | Pinterest-style boards: wishlist, inspo, collections |

- **Profile and settings** are behind the avatar in the top corner: sizes and fit notes, followed brands, server, MCP, export.
- **Add (+)** is a single floating button available everywhere. It opens one sheet: *Paste link · Take photo · From photos · Save inspo*.
- **Search** sits at the top of Discover and searches both stores and your closet, with a toggle.

### 4.2 Key screens

- **Product / item page**: built like a store product page. Large cutout photo, brand, price (product) or size/cost-per-wear (owned item), fit notes, **"More like this"**, **"Pairs with"** (from your closet), and Save / Own-this buttons.
- **Brand page**: logo, follow button, product grid, new drops, items from this brand you already own.
- **Outfit page**: a lookbook-style layout of the pieces with a "Wore this today" button.
- **Board**: masonry grid of anything saved (products, owned items, inspo images, outfits).

### 4.3 Core flows

**Add an item to the closet**
1. *Paste link* → the server scrapes structured product data (schema.org JSON-LD / OpenGraph) → name, brand, price, images and colors are prefilled → pick a size → done.
2. *Photo* → on-device cutout (iOS Vision subject lifting; the server does it for web uploads) → AI suggests category, color, material and formality → confirm with chips → done.
3. *Chat (MCP)* → "I own the Carhartt Detroit jacket in brown, size M" → the assistant researches it and calls `add_item` → it appears in the closet with a "Added via Claude" note.
4. *Order emails (later)* → connect email or forward receipts → purchases become items automatically.

**Taste onboarding (first run)**
- Swipe through about 30 outfits and items (like / skip), pick a few brands, enter basic sizes. That seeds the taste profile so Discover is useful on day one.
- Skippable. Taste also builds from saves, follows and wear logs.

**Daily loop**
- Open the app → "Wore this today" (one tap on an outfit or items) → scroll Discover → save things.

**Wishlist and price tracking**
- Save a product → we track its price → sale badge in Saved, with optional notifications (push in the cloud, ntfy/Apprise for self-host).

## 5. Platforms and feature parity (open question)

We haven't decided whether web and phone should match. **Recommendation: same core, each platform plays to its strengths.**

| | Phone (native) | Web |
|---|---|---|
| Browse Discover / Closet / Saved | ✅ | ✅ |
| Save, boards, outfits, wear logging | ✅ | ✅ |
| Add by link | ✅ (also via share sheet) | ✅ |
| Add by photo | ✅ **best here** (camera, on-device cutout) | ✅ upload |
| Taste swipe onboarding | ✅ **best here** | ✅ (buttons or keys) |
| Bulk edit / import / organize | basic | ✅ **best here** |
| Export, server admin, MCP setup, API tokens | view only | ✅ **best here** |
| Self-host admin (users, AI provider, storage) | — | ✅ |

Rules:
- **Every core feature exists on both.** Nobody should *have* to switch devices for everyday use.
- **Power and admin tasks can be web-only.**
- **Capture tasks can be better on the phone**, but must still be possible on the web.
- Both clients use the **same API and shared packages**, so parity is cheap to maintain.
- Until the native app ships, the web app is **responsive and installable (PWA)**, so the phone experience exists from day one.

## 6. Architecture

```
            ┌── Web (React + Vite, PWA)
 Clients ───┼── iOS / Android (Expo / React Native)
            └── AI assistants via MCP (Claude, ChatGPT, …)
                         │
           server URL: cloud (default) or self-hosted
                         │
        ┌────────────────┴─────────────────┐
        │ Server (one TypeScript codebase) │
        │ REST/tRPC API · auth · /mcp      │
        │ job worker (scrape, price, AI)   │
        └───┬───────────┬───────────┬──────┘
        Postgres     File storage   AI provider
        + pgvector   disk | S3/R2   cloud | Ollama | off
```

### 6.1 Deployments

| | Cloud | Self-hosted |
|---|---|---|
| Who runs it | Us | The user (PC, NAS, Pi, VPS) |
| Setup | Sign up in the app | `docker compose up` (app + Postgres, optional Ollama) |
| Accounts | Email, Apple, Google | Email; OIDC later |
| Storage | S3/R2 | Local disk volume |
| AI | Included (limited on free tier) | Ollama, the user's own API key, or off |
| MCP auth | OAuth (needed for Claude connectors) | API token (OAuth optional) |
| Cost | Freemium | Free, open source |

Apps start with a **server picker**: "Continue with Closet Cloud" (default), or "Use my own server" → enter a URL.

### 6.2 Repo layout (monorepo, pnpm workspaces)

```
apps/
  web/        React + Vite + Tailwind, PWA
  mobile/     Expo (React Native)
  server/     Hono API, MCP endpoint, worker
packages/
  shared/     zod schemas, types, constants
  api-client/ typed client used by web + mobile
  db/         Drizzle schema + migrations
docker/       Dockerfile, compose files
docs/
```

### 6.3 Stack

- **Language:** TypeScript everywhere
- **Server:** Hono, Drizzle ORM, Postgres + pgvector, pg-boss (job queue on Postgres, no Redis)
- **Auth:** Better Auth (email, OAuth providers, works with Drizzle)
- **Web:** React, Vite, Tailwind, TanStack Query
- **Mobile:** Expo, Expo Router, TanStack Query
- **MCP:** the official TypeScript SDK, Streamable HTTP at `/mcp`
- **CI/CD:** GitHub Actions → multi-arch images (amd64 + arm64) on GHCR

## 7. Data model (first pass)

Key distinction: a **product** is something in the catalog (it can be bought). An **item** is something a user owns. An item may link to a product.

| Table | Key fields |
|---|---|
| `users` | id, email, name, avatar |
| `profiles` | user_id, budget range, style notes, default sizes |
| `brand_fits` | user_id, brand_id, size, fit note ("runs big") |
| `brands` | id, name, domain, logo, platform (shopify/other), feed_url |
| `follows` | user_id, brand_id |
| `products` | id, brand_id, title, url, price, currency, images, colors, category, tags, embedding, last_seen_at |
| `price_points` | product_id, price, seen_at |
| `items` | id, user_id, product_id?, title, brand_id?, category, colors, size, material, formality, season, purchase_price, purchased_at, embedding, source (link/photo/mcp/email) |
| `media` | id, owner (item/product/inspo), url, kind (original/cutout/thumb) |
| `inspo` | id, user_id, image, source_url, embedding |
| `outfits` | id, user_id, name, cover |
| `outfit_items` | outfit_id, item_id, position |
| `boards` | id, user_id, name, kind (wishlist/inspo/custom), private |
| `board_entries` | board_id, entity_type (product/item/inspo/outfit), entity_id, note |
| `wear_logs` | user_id, item_id or outfit_id, worn_on |
| `taste_events` | user_id, entity, action (like/skip/save/follow/wear), at |
| `api_tokens` | user_id, name, scopes (read / write), hash |

## 8. AI pipeline and recommendations

**Pipeline (async jobs, run on new items, products and inspo):**
1. **Cutout:** on-device on iOS. On the server, an open-source segmentation model.
2. **Tagging:** a vision model suggests category, colors, material, pattern, formality and season. The user confirms.
3. **Embedding:** an image (and text) embedding stored in pgvector.

**What embeddings power:**
- **More like this:** nearest neighbors over products, items and inspo
- **Taste profile:** a weighted average of liked, saved and worn embeddings, minus skips
- **Discover ranking:** score = taste similarity + freshness + followed-brand boost + "fills a gap" boost − already-own-similar penalty
- **Pairs with:** embedding compatibility plus rules (color harmony, formality match, season)

**Provider abstraction:** one `AIProvider` interface (`tag(image)`, `embed(image|text)`, `cutout(image)`) with cloud, Ollama and none implementations. With none, tagging is manual and similarity falls back to tags and colors.

## 9. Catalog (where Discover's products come from)

1. **Followed brands:** many indie and streetwear brands run on Shopify, which usually exposes a public product feed. Following a brand pulls its catalog on a schedule. This works for cloud and self-host alike.
2. **Affiliate network feeds (cloud):** official feeds from larger retailers. They also bring revenue.
3. **User saves:** every pasted link adds a product.
4. **Rules:** prefer official feeds, cache aggressively, rate-limit, respect robots.txt and terms, and remove a brand on request.

Self-hosted instances build their own catalog from what their users follow and save. We could later offer an optional "cloud catalog" feed to self-hosters.

## 10. MCP

The chat side of the product. It is exposed at `/mcp` on every server.

**Tools**
| Tool | Scope | Purpose |
|---|---|---|
| `search_closet` | read | Filter by category, color, season, tags, or free text |
| `get_item` / `get_item_image` | read | Details plus the actual image, so vision models can see it |
| `get_profile` | read | Sizes, brand fits, budget, style notes |
| `wear_stats` | read | Most/least worn, cost per wear, unworn items |
| `list_outfits` / `list_boards` | read | |
| `search_catalog` | read | Search products in this server's catalog |
| `add_item` | write | Add an owned item (with image URLs and details) |
| `save_to_board` | write | Save a product, inspo or link to a board |
| `save_outfit` | write | Create an outfit from items |
| `log_wear` | write | |
| `follow_brand` | write | |
| `update_style_notes` | write | |

**Prompts:** "Style me for…", "What's missing from my closet?", "Shop for X in my style", "Add what I just bought".

**Auth:** OAuth on the cloud (Claude custom connectors require it). Self-hosted servers use tokens or OAuth. Read-only by default, with writes opt-in per token.

**Companion skill (later):** a downloadable skill that teaches assistants how to style and how to find where to shop, using these tools.

## 11. Privacy and data ownership

- Export everything (JSON + media zip) from settings, on both deployments.
- Delete the account → hard delete within 30 days (cloud).
- Body-related data (sizes, fit) is never used for ads or shared.
- Self-host: no telemetry by default.

## 12. Business model (cloud)

- **Free:** closet, boards, Discover, limited AI tagging per month.
- **Paid:** unlimited AI, price alerts, email import, more storage.
- **Affiliate links** on purchases from Discover and the wishlist (always disclosed).
- **Self-host:** free and open source (AGPL proposed, like Immich, so nobody can resell it as a closed service).

## 13. Roadmap

**Phase 0 — Foundation**
Monorepo, Postgres + Drizzle, Better Auth, Docker compose, CI building images.

**Phase 1 — Closet (web, responsive PWA)**
Add by link and photo, items grid, item page, brand fits, wear logging, export.

**Phase 2 — Saved + Discover**
Boards, wishlist and price tracking, follow brands (Shopify feeds), first Discover feed (follows + recency).

**Phase 3 — AI**
Provider abstraction, tagging, cutouts, embeddings, More like this, taste-ranked Discover, swipe onboarding.

**Phase 4 — MCP**
Read tools + token auth, then write tools, then prompts.

**Phase 5 — Native app**
Expo app: capture, share sheet, swipe onboarding, push.

**Phase 6 — Cloud launch**
OAuth MCP, R2 storage, billing, affiliate links, App Store release.

## 14. Open questions

1. **Web vs phone parity:** is the recommendation in §5 right?
2. **Name and brand.**
3. **Social features?** Following friends, public boards, sharing outfits. Explicitly **not** in v1.
4. **Resale:** "sell what you don't wear" could fit later.
5. **Self-host catalog:** offer an optional shared cloud catalog to self-hosters?
6. **License:** AGPL vs MIT.
7. **DB:** Postgres-only (proposed) vs also supporting SQLite for lighter self-hosting.

## 15. Risks

| Risk | Mitigation |
|---|---|
| Scope is large for one developer | Strict phase order, web first, native later |
| Data entry fatigue | Link import, photo batch, MCP, email import |
| Catalog scraping gets blocked or breaks | Prefer Shopify feeds and affiliate APIs, cache, degrade gracefully |
| AI cost in the cloud | On-device cutouts, cheap embedding models, free-tier limits |
| Empty Discover on day one | Swipe onboarding, a curated starter brand list |
| App Store review (affiliate, accounts) | Follow guidelines: Sign in with Apple, clear disclosures |
