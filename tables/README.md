# Tables

The test: can AI build tables people can trust, on any subject, at a sensible cost? Ten tables on different subjects, each scored the same way. If they can't reach about 95% correct, the idea stops before anything goes public.

## How a table is scored

Every cell gives a value with its source and exact quote, or says it wasn't found and where we looked.

| Check | What it shows | How |
|---|---|---|
| Valid | The file is well formed, every number is in its quote, and a text value uses only its quote's words | `tables validate <file>` |
| Traceable | Every quote really is on its source page | `tables verify <file>` |
| Correct | The value is right for that row and column | Blind check: a separate model reads each source without seeing our values, and every difference is settled against the source |
| Current | Every live quote is still on its page, with no AI involved | `tables watch <file>` |
| Filled | How much of the table has a value | `tables validate <file>` |
| Complete | Every row that belongs is there | A person compares it with the scope |

Only the blind check can say a value is correct: a quote can be real and still belong to a different model, or say less than the value claims. Results are in [`checks/`](checks/). `tables sample <file>` draws cells for a person to spot-check the check itself.

Rules: a value must be tied to that exact row, everything a value says must be in its quote, sources that price by time are re-read before a table is relied on, and we never get around a block. Every cell says what kind of source it used, and scores count the kinds separately:

| Kind | Meaning | Use it for |
|---|---|---|
| `first-hand` | The owner's own live page or file | Anything |
| `archived` | A dated public copy of the owner's page, for when the live page can't be read | Facts that don't change, never prices |
| `second-hand` | Someone else's account | Only when nothing closer exists |

A cell with no acceptable source stays missing and counts against the table.

A cell can also record more about itself:

| Field | Meaning |
|---|---|
| `confirmed` | How a second reader backed it up: `blind-read`, or the weaker `summary`. Without it, the value has been read once |
| `conflicts` | What other sources state instead, each read and quoted like the value itself |
| `history` | What the cell used to say, and the last day it stood |

Conflicts and past values follow the same rules as any value, so a summary's claim doesn't count until the document itself has been read.

A page that holds a law can be out of date and still contain its quotes, so a law's source must be the newest official text we can open, and the check log says how old each older source is. `tables verify` also prints any page that says "superseded" or "effective until". That can be a false alarm, and each one gets read.

A deploy gives a table the live server already has its new rows and scope. A cell only moves on for a value in a blank or a value read more recently, always as a new version, so an edit made on the site stays.

`tables watch` saves its results in [`watch/`](watch/), never in the table. It marks each cell `found`, `not-on-page`, `unreadable` or `robots`, and keeps the last day the quote was seen. Archived copies are `pinned` and aren't opened. A quote that's gone is a reason to look again, not proof the value changed, and a publish is what puts new results on the live server.

## The ten

| # | Table | Subject | Status |
|---|---|---|---|
| 1 | Handheld gaming PCs | Consumer tech | Built and blind checked |
| 2 | Deploy platforms: free offers and first paid step | Developer tools | Built and blind checked |
| 3 | AI model API prices | AI | Built and blind checked |
| 4 | E-readers | Consumer tech | Built and checked |
| 5 | Home batteries: capacity and warranty | Home energy | Built and checked |
| 6 | Password managers: plans and prices | Software | Deferred: two of four makers show no prices to our reader |
| 7 | Right-to-repair laws by US state | Law | Built, check incomplete |
| 8 | Data breach notification laws by US state | Law | All 51 rows built, checked and rechecked, 185 values blind read, 4 rows blank |
| 9 | Entrance fees at the most visited US national parks | Travel | Built, read once |
| 10 | EVs on sale in the US: EPA range | Cars | Deferred |
