import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";

import type { Persona } from "./types.js";

const categorySchema = z.enum([
  "disaster_natural",
  "disaster_conflict",
  "disaster_personal",
  "medical_emergency",
  "medical_ongoing",
  "mental_health",
  "housing",
  "food_security",
  "education",
  "children",
  "animal_welfare",
  "environment",
  "legal_aid",
  "community",
]);

const weightsSchema = z.object({
  severity: z.number(),
  marginal_impact: z.number(),
  evidence_quality: z.number(),
  category_fit: z.number(),
});

const evidenceAccessSchema = z.discriminatedUnion("pay_when", [
  z.object({
    max_price_per_fetch_usdc: z.number(),
    max_monthly_usdc: z.number(),
    pay_when: z.literal("never"),
  }),
  z.object({
    max_price_per_fetch_usdc: z.number(),
    max_monthly_usdc: z.number(),
    pay_when: z.literal("shortlisted_finalist"),
  }),
  z.object({
    max_price_per_fetch_usdc: z.number(),
    max_monthly_usdc: z.number(),
    pay_when: z.literal("always_if_eligible"),
  }),
  z.object({
    max_price_per_fetch_usdc: z.number(),
    max_monthly_usdc: z.number(),
    pay_when: z.literal("ask_llm"),
  }),
]).superRefine((value, ctx) => {
  if (value.pay_when === "ask_llm") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'evidence_access.pay_when "ask_llm" is not supported in v0.1.0; use "never", "shortlisted_finalist", or "always_if_eligible".',
      path: ["pay_when"],
    });
  }
});

const decisionFrameworkSchema = z
  .discriminatedUnion("amount_sizing", [
    z.object({
      weights: weightsSchema,
      amount_sizing: z.literal("flat"),
      max_donations_per_day: z.number(),
      min_days_between_donations_same_category: z.number(),
    }),
    z.object({
      weights: weightsSchema,
      amount_sizing: z.literal("severity_weighted"),
      max_donations_per_day: z.number(),
      min_days_between_donations_same_category: z.number(),
    }),
    z.object({
      weights: weightsSchema,
      amount_sizing: z.literal("marginal_impact_weighted"),
      max_donations_per_day: z.number(),
      min_days_between_donations_same_category: z.number(),
    }),
    z.object({
      weights: weightsSchema,
      amount_sizing: z.literal("llm_judges"),
      max_donations_per_day: z.number(),
      min_days_between_donations_same_category: z.number(),
    }),
  ])
  .superRefine((value, ctx) => {
    const sum =
      value.weights.severity +
      value.weights.marginal_impact +
      value.weights.evidence_quality +
      value.weights.category_fit;

    if (Math.abs(sum - 1) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `decision_framework.weights must sum to 1.0 ± 0.01; received ${sum.toFixed(4)}`,
        path: ["weights"],
      });
    }
  });

const personaSchema: z.ZodType<Persona> = z.object({
  identity: z.object({
    display_name: z.string(),
    creature_type: z.string(),
    vibe: z.string(),
    mission: z.string(),
    values: z.string(),
    preferred_categories: z.array(categorySchema),
  }),
  budget: z.object({
    monthly_usdc: z.number(),
    min_donation_usdc: z.number(),
    max_donation_usdc: z.number(),
    reserve_fraction: z.number(),
  }),
  evidence_access: evidenceAccessSchema,
  decision_framework: decisionFrameworkSchema,
});

export function loadPersona(path: string): Persona {
  const resolvedPath = resolve(path);

  try {
    const rawContents = readFileSync(resolvedPath, "utf8");
    const parsedYaml = YAML.parse(rawContents);
    return personaSchema.parse(parsedYaml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`Failed to load persona from ${resolvedPath}: ${message}`);
  }
}
