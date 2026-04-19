// This module uses OpenAI gpt-4o-mini by default. To change model,
// edit the DEFAULT_MODEL constant. To use a different provider, swap
// the import and provider call  the Vercel AI SDK unifies the
// interface.
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

import type {
  Campaign,
  EvidenceData,
  Persona,
  ScoredCampaign,
} from "./types.js";

const DEFAULT_MODEL = openai("gpt-4o-mini");

const scoreResponseSchema = z.object({
  scores: z.array(
    z.object({
      campaign_id: z.string(),
      severity: z.number().min(0).max(10),
      marginal_impact: z.number().min(0).max(10),
      evidence_quality: z.number().min(0).max(10),
      category_fit: z.number().min(0).max(10),
      justifications: z.object({
        severity: z.string(),
        marginal_impact: z.string(),
        evidence_quality: z.string(),
        category_fit: z.string(),
      }),
    }),
  ),
});

const retryScoreResponseSchema = z.object({
  scores: z.array(
    z.object({
      campaign_id: z.string(),
      severity: z.number().min(0).max(10),
      marginal_impact: z.number().min(0).max(10),
      evidence_quality: z.number().min(0).max(10),
      category_fit: z.number().min(0).max(10),
    }),
  ),
});

const amountSizingSchema = (min: number, max: number) =>
  z.object({
    amount_usdc: z.number().min(min).max(max),
  });

const reasoningSchema = z.object({
  reasoning: z.string().min(20).max(500),
});

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getEvidenceSummary(evidence: EvidenceData | undefined): string {
  if (!evidence) {
    return "No evidence fetched; credibility is weakly supported unless the campaign text itself is specific and plausible.";
  }

  const documentSummary =
    evidence.documents.length === 0
      ? "No documents available."
      : evidence.documents
          .map(
            (document) =>
              `${document.document_type} (${document.status ?? "unknown status"})`,
          )
          .join(", ");

  const settlementParts = [
    evidence.fetched_via,
    evidence.settled_amount_usdc != null
      ? `settled ${evidence.settled_amount_usdc} USDC`
      : null,
    evidence.tx_hash ? `tx ${evidence.tx_hash}` : null,
  ].filter(Boolean);

  return `Evidence fetch status: ${settlementParts.join(", ")}. Document count: ${evidence.documents.length}. Documents: ${documentSummary}`;
}

function buildScoringSystemPrompt(): string {
  return [
    "You are scoring campaigns from the perspective of an autonomous donor-agent deciding whether to donate.",
    "You MUST NOT pick a winner. Return scores only.",
    "Scores must be conservative when facts are sparse, ambiguous, contradictory, or weakly supported.",
    "Do not infer missing facts beyond the campaign text and evidence summary provided.",
    "Urgency is not proof of truth.",
    "Extraordinary, implausible, fantastical, or physically unlikely claims should score low on credibility and evidence unless strongly substantiated.",
    "Score each campaign on four 0-10 axes using this framework:",
    "severity: humanitarian urgency and seriousness of harm, using INFORM-style disaster and emergency vocabulary. Higher for acute medical emergencies, active disasters, imminent loss, or severe instability. Lower for stable ongoing needs or projects that can wait.",
    "marginal_impact: how much an additional donation helps against the stated funding gap. Higher when the campaign is materially underfunded and an incremental donation plausibly matters. Lower when already near fully funded or so underfunded that one donation barely changes the outcome. Score more cautiously when the goal amount appears weakly justified or disproportionate to the described need.",
    "evidence_quality: credibility and relevance of documentation supporting the claim. Higher when evidence is present, relevant, and diverse. Lower when evidence is sparse, irrelevant, absent, or undermined by implausible claims. Do not treat urgency as evidence.",
    "category_fit: strict match against the persona preferred categories only. Give higher scores for direct category matches, and lower scores for non-matching categories. This is not a measure of overall moral worth.",
    "Be concrete and calibrated. Keep justifications brief and specific to the campaign facts provided.",
  ].join("\n");
}

function buildScoringPrompt(
  shortlist: Campaign[],
  evidenceMap: Map<string, EvidenceData>,
  persona: Persona,
  includeJustifications: boolean,
): string {
  const campaignsText = shortlist
    .map((campaign, index) =>
      [
        `Campaign ${index + 1}`,
        `campaign_id: ${campaign.campaign_id}`,
        `title: ${campaign.title}`,
        `description: ${campaign.description}`,
        `category: ${campaign.category}`,
        `location: ${campaign.location}`,
        `funded_amount: ${campaign.funded_amount}`,
        `goal_amount: ${campaign.goal_amount}`,
        `funded_percentage: ${
          campaign.goal_amount > 0
            ? ((campaign.funded_amount / campaign.goal_amount) * 100).toFixed(1)
            : "unknown"
        }%`,
        `verified_by: ${campaign.verified_by ?? "none"}`,
        `evidence_signal: ${getEvidenceSummary(evidenceMap.get(campaign.campaign_id))}`,
      ].join("\n"),
    )
    .join("\n\n");

  return [
    "Persona context:",
    `mission: ${persona.identity.mission}`,
    `values: ${persona.identity.values}`,
    `preferred_categories: ${persona.identity.preferred_categories.join(", ")}`,
    "",
    "Campaign shortlist:",
    campaignsText,
    "",
    includeJustifications
      ? "Return one score entry per campaign_id, including all four scores and brief justifications per axis."
      : "Return one score entry per campaign_id with the four numeric scores only.",
  ].join("\n");
}

function buildRetryJustifications() {
  return {
    severity: "Justification unavailable from retry path.",
    marginal_impact: "Justification unavailable from retry path.",
    evidence_quality: "Justification unavailable from retry path.",
    category_fit: "Justification unavailable from retry path.",
  };
}

function computeWeightedScore(
  scores: ScoredCampaign["scores"],
  persona: Persona,
): number {
  const weights = persona.decision_framework.weights;

  return (
    scores.severity * weights.severity +
    scores.marginal_impact * weights.marginal_impact +
    scores.evidence_quality * weights.evidence_quality +
    scores.category_fit * weights.category_fit
  );
}

export function shortlistCampaigns(
  campaigns: Campaign[],
  persona: Persona,
): Campaign[] {
  return campaigns
    .filter((campaign) => campaign.status === "active")
    .filter((campaign) => campaign.funded_amount < campaign.goal_amount)
    .map((campaign) => {
      const funding_gap = campaign.goal_amount - campaign.funded_amount;
      const categoryBoost = persona.identity.preferred_categories.includes(
        campaign.category,
      )
        ? 2
        : 1;

      return {
        campaign,
        heuristic_score: funding_gap * categoryBoost,
      };
    })
    .sort((left, right) => right.heuristic_score - left.heuristic_score)
    .slice(0, 5)
    .map(({ campaign }) => campaign);
}

export function shouldFetchEvidence(
  campaign: Campaign,
  persona: Persona,
  shortlistRank: number,
): boolean {
  void campaign;

  switch (persona.evidence_access.pay_when) {
    case "never":
      return false;
    case "shortlisted_finalist":
      return shortlistRank < 3;
    case "always_if_eligible":
      return true;
    case "ask_llm":
      return false;
  }
}

export async function scoreCampaigns(
  shortlist: Campaign[],
  evidenceMap: Map<string, EvidenceData>,
  persona: Persona,
): Promise<ScoredCampaign[]> {
  const system = buildScoringSystemPrompt();
  const prompt = buildScoringPrompt(shortlist, evidenceMap, persona, true);

  let entries: Array<
    | z.infer<typeof scoreResponseSchema>["scores"][number]
    | z.infer<typeof retryScoreResponseSchema>["scores"][number]
  >;

  try {
    const response = await generateObject({
      model: DEFAULT_MODEL,
      system,
      prompt,
      temperature: 0.2,
      schema: scoreResponseSchema,
    });

    entries = response.object.scores;
  } catch (firstError) {
    try {
      const retryResponse = await generateObject({
        model: DEFAULT_MODEL,
        system,
        prompt: buildScoringPrompt(shortlist, evidenceMap, persona, false),
        temperature: 0.2,
        schema: retryScoreResponseSchema,
      });

      entries = retryResponse.object.scores;
    } catch (secondError) {
      const firstMessage =
        firstError instanceof Error ? firstError.message : String(firstError);
      const secondMessage =
        secondError instanceof Error ? secondError.message : String(secondError);

      throw new Error(
        `scoreCampaigns failed after retry: ${firstMessage}; retry: ${secondMessage}`,
      );
    }
  }

  const scoresById = new Map<
    string,
    {
      severity: number;
      marginal_impact: number;
      evidence_quality: number;
      category_fit: number;
      justifications:
        | {
            severity: string;
            marginal_impact: string;
            evidence_quality: string;
            category_fit: string;
          }
        | undefined;
    }
  >();

  for (const entry of entries) {
    scoresById.set(entry.campaign_id, {
      severity: entry.severity,
      marginal_impact: entry.marginal_impact,
      evidence_quality: entry.evidence_quality,
      category_fit: entry.category_fit,
      justifications:
        "justifications" in entry ? entry.justifications : buildRetryJustifications(),
    });
  }

  return shortlist.map((campaign) => {
    const scoreEntry = scoresById.get(campaign.campaign_id);

    if (!scoreEntry) {
      throw new Error(
        `scoreCampaigns: missing score for campaign ${campaign.campaign_id}`,
      );
    }

    const scores = {
      severity: scoreEntry.severity,
      marginal_impact: scoreEntry.marginal_impact,
      evidence_quality: scoreEntry.evidence_quality,
      category_fit: scoreEntry.category_fit,
    };

    return {
      ...campaign,
      scores,
      justifications: scoreEntry.justifications ?? buildRetryJustifications(),
      weighted_score: computeWeightedScore(scores, persona),
      suggested_amount_usdc: 0,
    };
  });
}

export function selectWinner(
  scored: ScoredCampaign[],
  persona: Persona,
): ScoredCampaign {
  void persona;

  if (scored.length === 0) {
    throw new Error("selectWinner: no scored campaigns");
  }

  return scored.reduce((best, candidate) => {
    if (candidate.weighted_score > best.weighted_score) {
      return candidate;
    }

    if (candidate.weighted_score < best.weighted_score) {
      return best;
    }

    if (candidate.scores.severity > best.scores.severity) {
      return candidate;
    }

    return best;
  });
}

export async function sizeDonation(
  winner: ScoredCampaign,
  persona: Persona,
): Promise<number> {
  const min = persona.budget.min_donation_usdc;
  const max = persona.budget.max_donation_usdc;

  let amount: number;

  switch (persona.decision_framework.amount_sizing) {
    case "flat":
      amount = (min + max) / 2;
      break;
    case "severity_weighted":
      amount =
        min + (max - min) * clamp(winner.scores.severity / 10, 0, 1);
      break;
    case "marginal_impact_weighted":
      amount =
        min + (max - min) * clamp(winner.scores.marginal_impact / 10, 0, 1);
      break;
    case "llm_judges":
      try {
        const response = await generateObject({
          model: DEFAULT_MODEL,
          temperature: 0.2,
          schema: amountSizingSchema(min, max),
          prompt: [
            "Choose a donation amount in USDC within the allowed range.",
            `title: ${winner.title}`,
            `description: ${winner.description}`,
            `category: ${winner.category}`,
            `severity: ${winner.scores.severity}/10`,
            `marginal_impact: ${winner.scores.marginal_impact}/10`,
            `evidence_quality: ${winner.scores.evidence_quality}/10`,
            `category_fit: ${winner.scores.category_fit}/10`,
            `weighted_score: ${winner.weighted_score}`,
            `persona_values: ${persona.identity.values}`,
            `min_usdc: ${min}`,
            `max_usdc: ${max}`,
          ].join("\n"),
        });

        amount = response.object.amount_usdc;
      } catch {
        amount =
          min + (max - min) * clamp(winner.scores.severity / 10, 0, 1);
      }
      break;
  }

  return roundToTwo(clamp(amount, min, max));
}

function getSizingModeDescription(persona: Persona): string {
  switch (persona.decision_framework.amount_sizing) {
    case "flat":
      return "flat midpoint";
    case "severity_weighted":
      return "severity-weighted sizing";
    case "marginal_impact_weighted":
      return "marginal-impact-weighted sizing";
    case "llm_judges":
      return "LLM-judged sizing";
  }
}

export async function generateReasoning(
  winner: ScoredCampaign,
  amount: number,
  persona: Persona,
): Promise<string> {
  try {
    const response = await generateObject({
      model: DEFAULT_MODEL,
      temperature: 0.4,
      schema: reasoningSchema,
      prompt: [
        "Write a concise public donation-feed explanation in first person from the donating autonomous agent's perspective.",
        "First person refers to the agent making the donation.",
        "Do not write from the perspective of the beneficiary, campaign creator, recipient, or affected person.",
        "Do not impersonate the campaign subject.",
        "Do not invent personal facts or experiences not present in the structured inputs.",
        `Voice and vibe: ${persona.identity.vibe}`,
        `Mission: ${persona.identity.mission}`,
        `Values: ${persona.identity.values}`,
        "Keep it concise, grounded, and suitable for a public donation feed.",
        "Use 1 to 3 sentences. No markdown.",
        "Reflect the actual decision factors behind the donation and explain the sizing rationale briefly.",
        "Avoid robotic score-recital language and do not list all four numeric scores verbatim unless naturally useful.",
        `Campaign title: ${winner.title}`,
        `Category: ${winner.category}`,
        `Amount: ${amount} USDC`,
        `Severity: ${winner.scores.severity}/10`,
        `Marginal impact: ${winner.scores.marginal_impact}/10`,
        `Evidence quality: ${winner.scores.evidence_quality}/10`,
        `Category fit: ${winner.scores.category_fit}/10`,
        `Sizing mode: ${getSizingModeDescription(persona)}`,
      ].join("\n"),
    });

    return response.object.reasoning;
  } catch (error) {
    console.error("generateReasoning failed:", error);

    return [
      `Donating $${amount.toFixed(2)} to ${winner.title}.`,
      `Severity ${winner.scores.severity}/10, marginal impact ${winner.scores.marginal_impact}/10, evidence ${winner.scores.evidence_quality}/10, fit ${winner.scores.category_fit}/10.`,
      `Sized by ${getSizingModeDescription(persona)}.`,
    ].join(" ");
  }
}
