# Search interpretation experiment

Decision: keep ordinary search working and AI interpretation **off by default**.
The old phrase parser is removed. No API key or model call is needed for keyword
search, manual filters, saved searches, or editing a frozen interpretation.

## Optional implementation

Set `SEARCH_INTENT_ENABLED=true` and `OPENAI_API_KEY` on the server to experiment.
`SEARCH_INTENT_MODEL` defaults to `gpt-5.6-luna`, using Responses structured output
with reasoning disabled. Model selection is provisional, not an accuracy claim.
Queries sent to this path go to OpenAI; the request uses `store:false`.

Auto routing sends descriptive/constraint-bearing queries to the model and skips
simple keywords. This is only a routing heuristic, not language understanding.
`mode=assisted` explicitly requests interpretation; `mode=keyword` bypasses it.
Malformed output, refusal, timeout, missing configuration, concurrency saturation,
or exhausted quota falls back to the original words and explicit filters.

- Required conditions and exact-currency budget limits filter offers.
- `lt` means strictly under, `lte` means up to, and cents are preserved.
- Approximate budgets and preferred conditions rank, never exclude, eligible offers.
- Size/material/color/style/exclusion attributes are visible but unverified.
  Positive terms add one retrieval query; exclusions are not guaranteed by title matching.
- User edits are validated against the same versioned contract. Saved searches
  persist JSON intent and replay it without another model call. Legacy saves keep
  their old explicit filters and literal query.
- Evidence must be present in the request. This catches fabricated quotations,
  not every semantic mistake. The model can still misunderstand a request.

Limits: 5-second interpretation deadline; 4 simultaneous model requests;
200 cached interpretations for 10 minutes; 1,200 output tokens; at most two source
queries; `SEARCH_INTENT_DAILY_LIMIT=1000` per process. The daily counter is in memory
and resets on restart, so it is **not a durable billing cap** or a multi-instance quota.
Provider/project spending controls should be configured before public activation.

## Evaluation before activation

From `apps/server`, run `pnpm search:eval` with the key and chosen model in the
environment (or the root `.env`). This makes paid calls for the fixed evaluation
queries. It reports constraint checks, fallback rate and latency; it does not test
catalog coverage or prove real-world relevance. No credentials means no requests.

First assess real keyword searches for useful top results, correct variants,
availability and source coverage. Then compare the same descriptive requests with
and without interpretation, manually judge the actual offers, and measure cost and
latency. Keep interpretation off unless it materially improves those results.

Current verification uses fixture provider responses for parsing, ranking,
transport, budgets, cache and failure behavior. **Live model accuracy is unmeasured.**

References: [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[model and pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna).
