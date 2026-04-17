import type { AgentState, Persona, ScoredCampaign } from "./types.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function getElapsedDays(isoDate: string): number | null {
  const parsed = Date.parse(isoDate);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return (Date.now() - parsed) / MS_PER_DAY;
}

export function checkPreDecisionGates(
  state: AgentState,
  persona: Persona,
): { proceed: boolean; reason?: string } {
  if (
    state.donations_today_count >=
    persona.decision_framework.max_donations_per_day
  ) {
    return { proceed: false, reason: "daily donation cap reached" };
  }

  const effectiveMonthlyBudget = roundToTwo(
    persona.budget.monthly_usdc * (1 - persona.budget.reserve_fraction),
  );

  if (roundToTwo(state.monthly_spent_usdc) >= effectiveMonthlyBudget) {
    return {
      proceed: false,
      reason: "monthly spending budget exhausted (reserve preserved)",
    };
  }

  return { proceed: true };
}

export function checkPostDecisionGates(
  state: AgentState,
  persona: Persona,
  winner: ScoredCampaign,
  amount: number,
): { proceed: boolean; reason?: string } {
  if (
    roundToTwo(state.monthly_spent_usdc + amount) >
    roundToTwo(persona.budget.monthly_usdc)
  ) {
    return { proceed: false, reason: "donation would exceed monthly budget cap" };
  }

  const minDays =
    persona.decision_framework.min_days_between_donations_same_category;

  if (minDays > 0) {
    const lastDonationAt = state.last_donation_by_category[winner.category];

    if (lastDonationAt) {
      const elapsedDays = getElapsedDays(lastDonationAt);

      if (elapsedDays !== null && elapsedDays < minDays) {
        return {
          proceed: false,
          reason: `category spacing window still active: ${winner.category}`,
        };
      }
    }
  }

  return { proceed: true };
}

export function canAffordEvidence(
  state: AgentState,
  persona: Persona,
  price_usdc: number,
): boolean {
  if (price_usdc > persona.evidence_access.max_price_per_fetch_usdc) {
    return false;
  }

  if (
    roundToTwo(state.monthly_evidence_spent_usdc + price_usdc) >
    roundToTwo(persona.evidence_access.max_monthly_usdc)
  ) {
    return false;
  }

  return true;
}

export function recordDonation(
  state: AgentState,
  amount: number,
  category: string,
): AgentState {
  return {
    ...state,
    monthly_spent_usdc: roundToTwo(state.monthly_spent_usdc + amount),
    donations_today_count: state.donations_today_count + 1,
    last_donation_by_category: {
      ...state.last_donation_by_category,
      [category]: new Date().toISOString(),
    },
  };
}

export function recordEvidencePayment(
  state: AgentState,
  amount: number,
): AgentState {
  return {
    ...state,
    monthly_evidence_spent_usdc: roundToTwo(
      state.monthly_evidence_spent_usdc + amount,
    ),
  };
}
