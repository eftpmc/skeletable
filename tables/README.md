# Tables

The test: can AI build tables people can trust, on any subject, at a sensible cost? Ten tables on different subjects, each scored the same way. If they can't reach about 95% correct, the idea stops before anything goes public.

## How a table is scored

Every cell gives a value with its source and exact quote, or says it wasn't found and where we looked.

| Check | What it shows | How |
|---|---|---|
| Valid | The file is well formed, and every number is in its quote | `tables validate <file>` |
| Traceable | Every quote really is on its source page | `tables verify <file>` |
| Correct | The value is right for that row and column | A person checks `tables sample <file>` by hand |
| Filled | How much of the table has a value | `tables validate <file>` |
| Complete | Every row that belongs is there | A person compares it with the scope |

Only the hand check can say a value is correct. A quote can be real and still belong to a different model.

Rules: a value must be tied to that exact row, and we never get around a block. Every cell says what kind of source it used, and scores count the kinds separately:

| Kind | Meaning | Use it for |
|---|---|---|
| `first-hand` | The owner's own live page or file | Anything |
| `archived` | A dated public copy of the owner's page, for when the live page can't be read | Facts that don't change, never prices |
| `second-hand` | Someone else's account | Only when nothing closer exists |

A cell with no acceptable source stays missing and counts against the table.

## The ten

| # | Table | Subject | Status |
|---|---|---|---|
| 1 | Handheld gaming PCs | Consumer tech | First pass |
| 2 | Deploy platforms: free tiers and first paid plans | Developer tools | Planned |
| 3 | AI model API prices | AI | Planned |
| 4 | E-readers | Consumer tech | Planned |
| 5 | Home batteries: capacity and warranty | Home energy | Planned |
| 6 | Password managers: plans and prices | Software | Planned |
| 7 | Right-to-repair laws by US state | Law | Planned |
| 8 | Data breach notification deadlines by US state | Law | Planned |
| 9 | Entrance fees at the most visited US national parks | Travel | Planned |
| 10 | EVs on sale in the US: EPA range | Cars | Planned |
