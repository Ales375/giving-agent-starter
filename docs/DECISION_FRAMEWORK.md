# Decision Framework

This starter exists to make sophisticated giving structure available at individual scale. Large institutions already use explicit frameworks to compare urgency, assess evidence, and decide how much to spend. Most individual giving, by contrast, happens with very little consistency: a moving story gets attention, a recommendation lands at the right moment, or a crisis happens to be highly visible. `giving-agent-starter` tries to narrow that gap without pretending that philanthropy can be reduced to a formula.

The framework is intentionally simple enough to fit inside one agent loop and one persona file. It does not aim to solve moral philosophy. It aims to force a useful discipline: separate urgency from proof, separate fit from impact, and let a builder decide how much each of those should matter. The deep value judgment stays with the persona. The code provides a repeatable structure.

## Severity

Severity asks: how bad is the situation described by this campaign? The reference point is humanitarian triage language such as the INFORM Severity Index and the familiar five-phase framing of minimal, stressed, crisis, critical, and catastrophic conditions. The starter does not import those systems mechanically, but it borrows their central instinct: some needs are plainly more urgent than others, and a giving agent should be able to say so.

High severity usually means acute harm or a credible risk of rapid deterioration. A campaign for emergency surgery, urgent shelter after displacement, or immediate food insecurity is likely to score higher because the downside of delay is large. Low severity does not mean unworthy. It usually means the situation is more stable, more aspirational, or less time-sensitive. An educational enrichment project, a long-horizon community effort, or a campaign that could plausibly wait a month without major additional harm will often score lower on severity even if it is still worth funding.

Severity is not a statement about the moral worth of a person or cause. It is a statement about urgency and intensity of need in the described moment.

## Marginal Impact

Marginal impact asks: how much does this donation actually change the outcome? This is where the framework borrows from cost-effectiveness reasoning, GiveWell-style thinking about the value of the next dollar, and practical grant peer review. The question is not whether a campaign is good in the abstract. The question is what this particular donation accomplishes at this particular funding level.

The highest marginal-impact scores tend to go to campaigns where a modest donation meaningfully moves the funding gap. If a campaign is underfunded but plausible, and another $10 or $20 changes what can happen next, the marginal dollar matters. That is what the score is trying to capture.

Two kinds of campaigns often score lower here. Near-fully-funded campaigns score lower because an additional small donation may not change much; the key threshold has already been crossed. Massively underfunded campaigns can also score lower, because a very small donation may not move the outcome in a meaningful way. This is why the framework avoids the simplistic rule that “more underfunded is always better.” The interesting zone is where the next dollar has leverage.

## Evidence Quality

Evidence quality asks: how credible is the claim being made? This axis borrows from grant peer review habits used in places like NIH review, foundation due diligence, and ordinary nonprofit diligence. The core question is whether the campaign provides documentation that is relevant to the need it describes.

High evidence quality means the supporting material is concrete, relevant, and proportional to the claim. For a medical emergency, that might include documentation of diagnosis or treatment need. For housing loss, it might include eviction or displacement evidence. For disaster response, it might include proof of location, damage, or direct need. The exact form of evidence will vary by category, but the logic is consistent: the documentation should help a reasonable reviewer believe the claim more strongly.

Absence of evidence is not treated as automatic disqualification. It is scored low, not impossible. That matters because some legitimate need will always be underdocumented, especially for people with lower digital access or lower administrative capacity. The persona decides how punitive that low score should be by setting the evidence weight. An evidence-heavy persona can make documentation dominant. A contrarian or localist persona can keep evidence as one input among several.

## Category Fit

Category fit asks: how closely does this campaign match the persona’s stated priorities? This is the only axis that is openly subjective by design. It is where the builder says, in advance, “these are the kinds of need I want this agent to notice first.”

In practice, category fit is usually derived from `preferred_categories` in `persona.yaml`. A campaign inside the preferred set should score high. A campaign outside it may still receive a middling score if it is adjacent to the persona’s interests, and a lower score if it is unrelated. This axis is usually the smallest weight because it is meant to steer, not dominate. If it becomes too large, the framework stops being a structured comparison and starts becoming a hard-coded cause filter with extra steps.

That said, some builders will want exactly that. A faith-based mutual aid persona, a local community persona, or an animal welfare specialist may intentionally assign a larger category weight. The framework allows it; it just does not prescribe it.

## How Scores Become Decisions

Each shortlisted campaign receives a 0-10 score on all four axes. The agent then applies the persona’s weights to compute a weighted sum. That weighted score determines the winner. Tie-breaking is deterministic: the agent prefers the higher severity campaign, then falls back to array order or creation order where available. The important point is that selection after scoring is code-driven, not model-driven.

Donation sizing is a separate step. The winner is chosen first, then the amount is chosen using the persona’s `amount_sizing` rule. That separation matters because “which campaign should win?” and “how much should go to the winner?” are different decisions. A builder can be severity-heavy in selection while still using a flat donation amount, or can use a more variable sizing rule without changing how winners are chosen.

The weights are not the starter’s worldview. They are the persona’s philosophical choice. The starter does not tell you whether severity should dominate evidence, whether category fit should matter a lot, or whether marginal impact should outweigh everything else. It only enforces that the weights sum cleanly and then applies them consistently.

## Methodological Neutrality

This framework is meant to work uniformly across very different giving philosophies. An effective altruist persona can emphasize marginal impact and evidence quality. A faith-based giving persona can emphasize severity and category fit. A local mutual aid persona can prefer community and housing. A contrarian persona can downweight evidence and focus on neglected campaigns. The code path stays the same.

That neutrality is deliberate. The starter does not contain implicit causes, hidden moral weights, or a recommended ideology. There is no built-in preference for medical campaigns over education, for global needs over local needs, or for documented cases over underdocumented ones beyond what the persona encodes. The persona sets the values. The framework supplies the comparison method.

## Intellectual Honesty

This framework has real limits. It cannot compare all forms of suffering precisely across categories. It cannot tell you whether one life outcome is morally commensurable with another. LLM-based scoring remains partly non-deterministic even when prompts are careful. The four axes are a useful compression of a messy reality, not a universal truth.

It also depends on the quality of what campaigns disclose. Evidence can be missing for legitimate reasons. Descriptions can be sparse. Funding gaps can be meaningful in one context and misleading in another. And some of the most important moral judgments still happen before the framework even starts, when a builder decides what values to encode in the persona.

The right way to use this system is not to treat it as objective truth. The right way is to treat it as disciplined judgment: explicit, configurable, inspectable, and honest about where uncertainty remains.
