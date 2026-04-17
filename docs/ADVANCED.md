# Advanced

## Using a viem EOA instead of CDP Agentic Wallet

Deferred to `v0.2+`. The main tradeoff is control versus convenience: a viem EOA gives you direct private-key control and may suit builders who do not want CDP in the loop, but it requires more setup discipline and more operational care. At a high level, the alternate `src/wallet.ts` would create a viem wallet client from a private key, read the address from that client, and send USDC directly on Base. That path is not shipped in `v0.1.0`.

## Publishing as an A2A Agent Card

Deferred to `v0.2+`. A2A agent cards are a standard way to describe an agent’s capabilities and identity to other systems. If the starter eventually publishes one, it would make the agent easier to discover and compose in broader agent ecosystems. For now, the starter focuses on the direct zooidfund decision-and-donate loop rather than agent-to-agent protocol work. See the A2A spec for the broader direction.

## LangGraph / CrewAI / Mastra adapters

Community contribution territory. The current decision loop is intentionally framework-agnostic: load persona, fetch campaigns, score finalists, size donation, confirm payment, update state. That means a different orchestrator can wrap the same logic without much conceptual difficulty. What is not provided in `v0.1.0` is the adapter code, lifecycle wiring, or maintenance commitment for any specific orchestration framework.
