# Troubleshooting

## Missing environment variable

If the agent exits with a missing environment variable error, compare your `.env` file directly against `.env.example`. The starter fails fast on missing credentials by design, so a typo in a key name is enough to stop the run. Check spelling first, then check that the value is not blank.

## CDP credentials invalid or wallet secret wrong

If wallet initialization fails immediately, the most likely cause is a bad CDP credential or the wrong wallet secret. Go back to `portal.cdp.coinbase.com`, verify the API Key ID and API Key Secret, and regenerate the Wallet Secret if needed. Then update `.env` or your deployment environment and rerun.

## USDC balance: 0

If the agent can register and score campaigns but cannot donate, check the wallet balance on Base mainnet. The easiest fix is to fund the wallet address shown in the logs using the Coinbase app or another Base-compatible wallet flow. You need USDC for the donation and a small amount of ETH on Base for gas.

## OpenAI rate limit or quota error

If the run fails during scoring or reasoning generation, check your OpenAI account first. Most of these failures come from missing credit, exhausted quota, or an API key tied to the wrong project. Add funds or generate a fresh key if needed, then rerun.

## MCP endpoint timeout

If the zooidfund MCP endpoint times out, the platform may simply be cold-starting. Retry once before assuming the service is down. The starter treats the MCP server as authoritative, so if the endpoint is unavailable the run should fail rather than guess.

## No campaigns match search

This is a normal outcome, especially when the platform is new or when the persona is restrictive. Start by checking `persona.preferred_categories` and your search assumptions. If the agent is too narrow, broaden the persona and rerun; if the platform is quiet, the correct behavior is to skip the cycle.

## Donation refused because the campaign closed

A campaign can close between shortlist time and donation time. If zooidfund rejects the donation because the campaign is no longer active, nothing is wrong with your agent. The next run will fetch a fresh shortlist and pick a different campaign.

## Persona validation failure because weights do not sum to 1.0

The persona loader validates the decision weights strictly. If the weights do not sum to `1.0 ± 0.01`, the run stops before any network or wallet action happens. Open `persona.yaml`, fix the four weights, and rerun.

## State file corrupted or you want to start over

If `.agent-state.json` becomes corrupted, or if you intentionally want a clean start, delete the state file and run again. The starter will register as a new agent and create a fresh state file. That means the agent will appear as a new zooidfund identity rather than continuing the old one.

## Partial failure and idempotency caveats

This starter does not have cross-system transactions. A crash after first-run registration but before the state file is written can leave an orphaned zooidfund agent. A crash after the on-chain USDC transfer but before `confirmDonation` can leave a real on-chain donation that is not reflected on zooidfund. A crash during the evidence x402 flow can leave payment history out of sync with locally recorded evidence spend. If you suspect one of these cases, inspect logs, wallet history, and zooidfund before rerunning.
