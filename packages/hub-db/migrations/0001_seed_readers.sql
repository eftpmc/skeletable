-- The readers the hub's code provides, kept in step with the hub's readers. A reader that isn't
-- written yet starts disabled, so detection never assigns it.
INSERT INTO "reader" ("id", "version", "enabled", "description") VALUES
  ('shopify', 1, true, 'Shopify stores, through their public products feed'),
  ('standard', 1, true, 'Any site with sitemaps and schema.org product data'),
  ('recipe', 1, true, 'A site read by its own live recipe'),
  ('woocommerce', 1, false, 'WooCommerce stores, through their public Store API'),
  ('bigcommerce', 1, false, 'BigCommerce stores, through their sitemaps and product pages'),
  ('squarespace', 1, false, 'Squarespace stores, through their JSON page format');
