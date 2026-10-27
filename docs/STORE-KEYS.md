# Getting store keys

Search looks through three kinds of store. Add them in the app under **Settings → Stores** (owners and admins), or set the environment variables in the [README](../README.md#stores-to-search).

| Source | What you need | Cost |
|---|---|---|
| Shopify stores | Just each shop's address | Free, no account |
| eBay | A production keyset from the eBay Developers Program | Free |
| Best Buy | An API key from the Best Buy developer site | Free |

Keys entered in the app are encrypted with the server's `AUTH_SECRET` before they're saved, and the app never shows them again (only their last four characters). If you change `AUTH_SECRET`, enter them again.

## Shopify stores

Nothing to sign up for. Search uses each shop's public storefront search.

1. Find a shop you'd like in results. To check it runs on Shopify, open `https://<the-shop>/products.json` in a browser: a Shopify shop answers with a list of products.
2. In **Settings → Stores → Shopify stores**, paste the address (for example `shop.example.com`), choose **Sells new** or **Secondhand**, and press **Add store**.
3. The app reads the shop before adding it and uses the shop's own name. If it can't read the products, it says so and adds nothing.

## eBay

eBay search uses the Browse API with an application token, so it only needs the two keys of a production keyset. The usual allowance is several thousand Browse calls a day, plenty for a small server.

1. Go to [developer.ebay.com](https://developer.ebay.com) and **Join** the eBay Developers Program with an eBay account. Approval can take up to a business day.
2. Open **Application Keysets** (under your name in the top menu) and create a keyset in **Production**. Sandbox keys only see test listings.
3. eBay asks production apps how they handle **marketplace account deletion** notices before it turns the keyset on. This app only reads public listings and keeps no eBay member data, so choose the option for apps that don't store eBay user data (eBay calls it an exemption) and give that as the reason. The wording on eBay's page changes from time to time; it's on the keyset's notifications settings.
4. Copy the **App ID (Client ID)** and the **Cert ID (Client Secret)**. The Dev ID isn't needed.
5. In **Settings → Stores → eBay**, press **Add keys**, paste both, and save. The status turns to **Connected** with the end of the App ID.

Searches use the US marketplace (`EBAY_US`). To search another one, set `EBAY_MARKETPLACE` (for example `EBAY_GB`) in the environment.

## Best Buy

Best Buy's Products API covers the US store, including open-box items.

1. Go to [developer.bestbuy.com](https://developer.bestbuy.com) and choose **Get API Key**. Sign up with an email address and confirm it.
2. Your key is shown on the site once your account is active (it's also emailed). If the form asks what it's for, a personal price-comparison app is accurate.
3. In **Settings → Stores → Best Buy**, press **Add keys**, paste the key, and save.

Best Buy limits each key to a few requests a second and a daily total; a small server stays well inside both.

## When something doesn't connect

- **"We couldn't read that store's products"** (Shopify): the address is wrong, the shop is password-protected, or it isn't on Shopify.
- **Searches come back without eBay or Best Buy results**: a key was mistyped, or the eBay keyset isn't enabled yet. Remove the keys, paste them again, and run a search; results show which stores answered.
- **Keys set in the environment** show as **Environment** in the app and can only be changed where the server is hosted.
