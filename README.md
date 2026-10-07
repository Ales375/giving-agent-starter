# giving-agent-starter

> **Status: withdrawn from recommended funded autonomous use.** This repository preserves an experimental TypeScript integration example. It is not a supported quickstart for an autonomous donor agent. Do not fund or schedule a wallet using this code as it stands.

zooidfund is a campaign registry and direct-donation platform for independently operated AI donor agents. Operators who already run an agent can review the [public zooidfund skill](https://github.com/Ales375/zooidfund-skill) and the [operator guide](https://zooid.fund/donor-agents) for the current MCP workflow. The operator sets the agent's assessment approach, mandate and spending controls. zooidfund does not assess campaign credibility or choose where an agent donates.

## Why this example is withdrawn

The current code is useful for studying a TypeScript MCP integration, persona configuration, campaign search, optional evidence access, direct USDC transfer and donation confirmation. Its assessment path can recover from failed scores with fallback values and still select a candidate. It does not have a sufficient fail-closed decision boundary for funded autonomous use.

`DRY_RUN=true` suppresses the donation transfer, but it is **not a zero-spend analysis mode**. A dry run can still reach paid x402 evidence access when eligible. It can also call real external services and register a real agent. Do not treat the `npm run dry` command as a safe rehearsal with no charges or external effects.

The current flow submits a transfer before calling `confirm_donation`. It records the completed donation in local state only after confirmation succeeds. A failure between those steps can leave a submitted transfer without a durable pending record for restart and reconciliation. Do not rerun the cycle on the assumption that confirmation failure means no transfer occurred.

These are source-code limitations of this example. They are not claims about any other donor agent or deployed integration. The source and Git history remain available for review; the earlier setup and deployment recipes have been removed from this README because they encouraged funded autonomous operation.

## Before reconsidering a recommendation

Recommending this code for funded autonomous use would require separate, reviewed work that demonstrates all of the following:

- Incomplete or failed assessments and an empty eligible set lead to abstention before any donation transfer.
- An analysis-only mode invokes neither paid evidence access nor wallet transfer, including on failure paths.
- A submitted transfer is recorded durably before confirmation, reconciled after restart, and never resent merely because confirmation failed.
- Current provider inputs and outputs are checked against maintained contract fixtures, with explicit operator controls and failure-path tests.

No rehabilitation schedule is promised. The example can remain a historical technical reference while other work takes priority.

## Scope of the preserved source

The code illustrates an MCP client, configurable persona scoring, evidence retrieval through provider-supplied signed URLs, x402 evidence access, and a CDP-managed wallet transfer followed by `confirm_donation`. Its persona files and supporting documents describe the original experiment; they do not override this status notice or establish operational safety. Donation funds in the zooidfund model move directly from an agent wallet to a campaign wallet on Base. zooidfund verifies recorded transfers and does not verify campaign claims.

## License

MIT. See [LICENSE](LICENSE).
