# AGENTS.md — giving-agent-starter

This file governs all AI-assisted work on this repository. Read it before
making any changes. Follow it precisely.

---

## Product Context

`giving-agent-starter` is a reference implementation of an autonomous
giving agent for the zooidfund platform (https://zooid.fund). It is MIT
licensed, open source, and meant to be forked. Non-engineers should be
able to clone it, edit `persona.yaml`, add API keys, and have a working
agent donating USDC on Base within 15 minutes.

The starter exists to demonstrate that agentic AI makes institutional-
quality giving decision frameworks available at individual scale. It does
not prescribe any ideology, theology, or philosophical approach to giving.
It provides structure — severity scoring, cost-effectiveness reasoning,
evidence evaluation, portfolio discipline — that a builder fills with
their own values through persona configuration.

---

## What the agent does

On each scheduled run:

1. Loads persona from `persona.yaml`
2. On first run only: registers with zooidfund via MCP `register_agent`,
   writes the API key to `.agent-state.json`. Subsequent runs skip this.
3. Calls zooidfund MCP tools: `get_platform_overview`, `search_campaigns`
   (broad search of active campaigns), `get_campaign` on candidates,
   `get_campaign_donations` for peer signal; persona preferences are
   applied later during shortlist/scoring
4. Shortlists candidates using persona's shortlist criteria
5. Optionally pays for evidence on finalists via MCP `get_evidence`
   (and x402 endpoint if `evidence_access_price > 0`)
6. Calls LLM to score each finalist on four axes:
   severity, marginal_impact, evidence_quality, category_fit
7. Applies persona's weights deterministically to select winner
8. Sizes the donation using persona's amount_sizing rule
9. Calls LLM to generate the donation reasoning string
10. Checks budget and portfolio constraints
11. Calls MCP `donate`, executes USDC transfer via CDP Agentic Wallet,
    calls MCP `confirm_donation` with tx_hash
12. Updates budget state in `.agent-state.json`

---

## Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (Node 20+) |
| MCP client | Vercel AI SDK `experimental_createMCPClient` (streamable HTTP) |
| LLM | Vercel AI SDK — default OpenAI `gpt-4o-mini` |
| Wallet | Coinbase CDP Server Wallet v2 (`@coinbase/cdp-sdk`), named EVM account |
| Chain payment | Account-level `account.transfer({ token: "usdc", network: "base" })` via CDP SDK; `parseUnits` from viem for amount conversion |
| x402 client | x402 v2 package family (`@x402/fetch`, `@x402/core`, `@x402/evm`) |
| Persona format | YAML |
| State | JSON file, local, gitignored |
| Deploy | Railway (primary) or GitHub Actions cron (alternative) |

### CDP credentials model

The CDP SDK v2 authenticates with three pieces:

- `CDP_API_KEY_ID` — API key identifier from portal.cdp.coinbase.com
- `CDP_API_KEY_SECRET` — API key secret from portal.cdp.coinbase.com
- `CDP_WALLET_SECRET` — Wallet secret used to sign operations

Accounts are identified by freeform name via `cdp.evm.getOrCreateAccount({ name })`.
The starter uses `CDP_ACCOUNT_NAME` as the env var holding that name
(not "wallet ID" — CDP v2 has no wallet ID concept). The same name is
resolved on every run so the same account is used across runs.

Network for Base mainnet is `"base"`. For Base Sepolia it is `"base-sepolia"`.
USDC transfers use the SDK's built-in `account.transfer({ token: "usdc" })`
flow. No raw viem transaction construction is needed for USDC transfers.

---

## Non-negotiables

These rules cannot be relaxed by any future task:

1. **Never commit `.env` or `.agent-state.json`.** Both are gitignored.
   The API key must never appear in the repo.

2. **The starter reads zooidfund's MCP responses as authoritative.** It
   does not construct fallback URLs, does not handle deprecated response
   shapes, does not assume anything beyond what the current MCP returns.
   If zooidfund changes its API, the starter needs a version bump, not
   defensive branching.

3. **The agent calls `register_agent` at most once per clone.** First
   run writes the API key to `.agent-state.json`. Subsequent runs load
   it. Deleting the state file is the only way to re-register, and that
   is a builder choice, not a code path.

4. **Budget tracking is deterministic, not LLM-mediated.** The agent
   cannot spend more than `budget.monthly_usdc` in a calendar month.
   The LLM scores and narrates; code gates and sizes.

5. **The starter prescribes no causes.** Persona weights and
   preferred_categories are the only steering. The framework applies
   uniformly — an evidence-weighted persona and a severity-weighted
   persona run the same code path, they just set different weights.

6. **No dashboard, no web UI, no notification system.** The live feed
   at zooid.fund/feed is the observability layer. The starter is headless
   by design.

7. **Do not add features from the explicit deferred list** without a
   version bump discussion: A2A Agent Card, LangGraph adapter, multi-
   agent orchestration, CSV/database persistence, Discord/Slack output,
   Twitter posting, anything touching Moltbook.

---

## Directory ownership rules

| Directory | Who writes it |
|-----------|---------------|
| `src/`    | Codex during build, contributors after |
| `examples/` | Hand-curated personas; changes go through Claude planning |
| `docs/`   | Claude-authored; Codex may propose edits via PR |
| `persona.yaml` (repo root) | Builder configures their own agent here |
| `AGENTS.md` | Claude-only during planning sessions |
| `README.md` | Claude-only during planning sessions |

Codex may read any file. Codex may modify anything in `src/` and may
update `docs/TROUBLESHOOTING.md` and `.github/workflows/donate.yml` as
part of task execution. Other files are canon.

---

## Persona schema

`persona.yaml` structure:

```yaml
identity:
  display_name: string           # Public name on zoofund feed
  creature_type: string          # e.g., "deep-sea isopod"
  vibe: string                   # One-line character
  mission: string                # What the agent is trying to do
  values: string                 # Stated priorities
  preferred_categories:          # List from zooidfund's 14 categories
    - medical_emergency
    - housing

budget:
  monthly_usdc: number           # Hard cap per calendar month
  min_donation_usdc: number      # >= 10 (zooidfund minimum)
  max_donation_usdc: number
  reserve_fraction: number       # 0-1; held back for urgent cases

evidence_access:
  max_price_per_fetch_usdc: number
  max_monthly_usdc: number
  pay_when: enum                 # never | shortlisted_finalist |
                                 # always_if_eligible

decision_framework:
  weights:
    severity: number             # 0-1; must sum to 1.0 across the four
    marginal_impact: number
    evidence_quality: number
    category_fit: number
  amount_sizing: enum             # flat | severity_weighted |
                                  # marginal_impact_weighted | llm_judges
  max_donations_per_day: number
  min_days_between_donations_same_category: number
```

Weights are validated to sum to 1.0 ± 0.01 at persona load.
`evidence_access.pay_when: ask_llm` is not supported in v0.1.0.

---

## Decision framework — the four axes

Each finalist campaign is scored 0–10 on each axis. The LLM is told what
each axis means. Weights are persona-specific. Weighted sum determines
the winner.

**severity** — How bad is the situation the campaign describes?
Draws from humanitarian severity scales (INFORM, 5-phase). Higher for
acute medical emergencies, active disasters, imminent loss. Lower for
stable ongoing needs, aspirational projects, projects that could wait.

**marginal_impact** — How much does this donation actually change?
Higher when the campaign is underfunded and a donation meaningfully
closes the gap. Lower when the campaign is near-fully-funded (marginal
dollar does little) or massively underfunded (marginal dollar doesn't
move the needle). This is cost-effectiveness reasoning from GiveWell /
grant peer review adapted to the individual campaign level.

**evidence_quality** — Is the claim credibly documented?
Higher when evidence documents are present, diverse, and relevant to the
claim. Lower when evidence is sparse, irrelevant, or absent. An absent
evidence layer scores low but is not disqualifying — some personas
explicitly downweight evidence to reach underdocumented campaigns.

**category_fit** — Does it match the persona's stated preferences?
Binary-ish: 10 if category is in `preferred_categories`, 3-5 otherwise
depending on adjacency. This is the smallest weight for most personas;
it's the thumb on the scale, not the decision.

---

## Acceptance criteria

- First run with valid `.env` and `persona.yaml` → agent registers,
  runs one full decision cycle, either donates or exits with a clear
  reason (no eligible campaigns, budget exhausted, etc.)
- Subsequent runs skip registration
- Agent refuses to run if persona weights don't sum to 1.0
- Agent refuses to donate if `budget.monthly_usdc` would be exceeded
- Agent refuses to donate if `max_donations_per_day` would be exceeded
- Agent refuses to donate if `min_days_between_donations_same_category`
  would be violated
- `.agent-state.json` contains: api_key, agent_id, monthly_spent,
  last_donation_by_category (map), last_month_key (for reset logic)
- On month rollover, monthly_spent resets to 0
- MCP `get_evidence` response shape is handled exactly:
  - `evidence_documents` present → use them
  - `eligibility_status: "not_eligible"` → continue without evidence
  - `status: "payment_required"` → x402 flow per persona `pay_when`
- Donation `reasoning` field on feed includes scores per axis and
  sizing rationale in natural language

---

## Common failure modes

- **CDP credentials invalid:** Wallet init throws clearly, agent exits.
- **OpenAI API key missing or invalid:** LLM call throws clearly, agent
  exits.
- **MCP endpoint unreachable:** Fail fast with network error.
- **No campaigns match persona filters:** Agent exits cleanly with log
  message. This is normal behavior, not an error.
- **Persona weights don't sum to 1.0:** Agent refuses to start.
- **USDC transfer fails on-chain:** `confirm_donation` is not called,
  no double-charge. Agent exits, next run retries fresh decision.
- **Month rollover during run:** Budget state resets, new month's
  allocation applies.

---

*This document is the source of truth for all AI-assisted work on this
repository. Tasks that require changes to this file are escalated to a
Claude planning session.*
