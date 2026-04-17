# Customization

The starter is intentionally small enough that you can change behavior without learning a large framework. Most meaningful customization happens in three places: the model provider, the persona, and the decision loop.

## Changing the LLM provider

The project uses the Vercel AI SDK, which means the model call surface stays mostly the same even when the provider changes. In practice, swapping from OpenAI to Anthropic is usually a one-line import change and one-line model construction change in `src/decision.ts`.

The current pattern is:

```ts
import { openai } from "@ai-sdk/openai";

const DEFAULT_MODEL = openai("gpt-4o-mini");
```

To switch to Anthropic, the diff is:

```diff
- import { openai } from "@ai-sdk/openai";
+ import { anthropic } from "@ai-sdk/anthropic";

- const DEFAULT_MODEL = openai("gpt-4o-mini");
+ const DEFAULT_MODEL = anthropic("claude-3-5-haiku-latest");
```

That is the main benefit of using the AI SDK here: the rest of the `generateObject` call sites can remain nearly identical. You still need to install the Anthropic provider package and set the right API key environment variable, but the decision code itself stays compact.

## Changing the model

If you want to keep OpenAI but change quality or cost, edit `DEFAULT_MODEL` in `src/decision.ts`. That constant is reused for scoring, amount sizing in `llm_judges` mode, and reasoning generation, so one edit changes the whole decision pipeline.

`gpt-4o-mini` is a reasonable default because it is cheap, fast, and structured-output friendly. If you want better judgment at higher cost, move to something like `gpt-5-mini` when available in your account. The tradeoff is direct: better reasoning usually costs more and may be slower. For a daily agent, that may still be acceptable. For a high-frequency agent, it can add up quickly.

## Tuning persona weights

The most important customization surface is still `persona.yaml`. The decision weights under `decision_framework.weights` must sum to `1.0 ± 0.01`, and the loader will refuse to start otherwise. That validation is deliberate: it forces the builder to make tradeoffs explicit instead of letting the weights drift.

Changing weights changes behavior in intuitive ways. Raise `severity` and the agent becomes more emergency-seeking. Raise `marginal_impact` and it becomes more sensitive to funding gaps. Raise `evidence_quality` and it will favor better-documented campaigns. Raise `category_fit` and it becomes more faithful to the persona’s declared cause priorities.

For example, if you want the agent to focus more on high-severity emergencies, you might change:

```yaml
decision_framework:
  weights:
    severity: 0.50
    marginal_impact: 0.20
    evidence_quality: 0.20
    category_fit: 0.10
```

That does not “improve” the agent in a universal sense. It just changes what philosophy of giving it follows.

## Adding a new amount_sizing mode

Donation sizing lives in `src/decision.ts`, inside the `sizeDonation` function. The existing implementation uses a `switch` over `persona.decision_framework.amount_sizing`. If you want a new mode, add a new literal to the persona schema in `src/persona.ts`, then add a corresponding case in `sizeDonation`.

At a high level, the pattern looks like this:

```ts
switch (persona.decision_framework.amount_sizing) {
  case "flat":
    ...
  case "severity_weighted":
    ...
  case "my_new_mode":
    amount = someFormula(winner, persona);
    break;
}
```

Keep the existing guardrails: clamp the result to the persona’s min and max donation bounds, then round to two decimals for USDC.

## Extending the persona schema

If you want a new field in `persona.yaml`, the authoritative place to add it is the Zod schema in `src/persona.ts`. Once it exists there, the file will be validated automatically on startup. If the shape is wrong, the agent exits clearly instead of silently ignoring the field.

In practice, that means you add the field to the shared type in `src/types.ts`, then add the matching validation rule in the schema. Good candidates include extra exclusion rules, region preferences, or stricter evidence settings. The key is to keep the new field explicit and deterministic.

## Hooking custom logic

The orchestration lives in `src/index.ts`. That is the right place to add custom business logic that is not really part of the generic framework. Examples include blacklisting certain campaign patterns, adding a manual approval gate in dry-run mode, posting a webhook after donation, or logging extra diagnostics for a hosted deployment.

The clean insertion points are easy to spot. Add pre-donation filters after shortlisting or after scoring if you want to block campaigns. Add notification hooks after `confirmDonation` if you want external side effects. Add extra state updates near the existing `recordDonation` and `recordEvidencePayment` calls if you need more bookkeeping. The loop is deliberately linear so extension points are obvious.
