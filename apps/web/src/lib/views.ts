/** The tabs a table page has besides its overview, each at /owner/slug/<view>. */
export const tableViews = ["proposals", "history", "settings"] as const;
export type TableView = (typeof tableViews)[number];
