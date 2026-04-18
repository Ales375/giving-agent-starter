export type EvidenceAccess =
  | {
      max_price_per_fetch_usdc: number;
      max_monthly_usdc: number;
      pay_when: "never";
    }
  | {
      max_price_per_fetch_usdc: number;
      max_monthly_usdc: number;
      pay_when: "shortlisted_finalist";
    }
  | {
      max_price_per_fetch_usdc: number;
      max_monthly_usdc: number;
      pay_when: "always_if_eligible";
    }
  | {
      max_price_per_fetch_usdc: number;
      max_monthly_usdc: number;
      pay_when: "ask_llm";
    };

export type DecisionFramework =
  | {
      weights: {
        severity: number;
        marginal_impact: number;
        evidence_quality: number;
        category_fit: number;
      };
      amount_sizing: "flat";
      max_donations_per_day: number;
      min_days_between_donations_same_category: number;
    }
  | {
      weights: {
        severity: number;
        marginal_impact: number;
        evidence_quality: number;
        category_fit: number;
      };
      amount_sizing: "severity_weighted";
      max_donations_per_day: number;
      min_days_between_donations_same_category: number;
    }
  | {
      weights: {
        severity: number;
        marginal_impact: number;
        evidence_quality: number;
        category_fit: number;
      };
      amount_sizing: "marginal_impact_weighted";
      max_donations_per_day: number;
      min_days_between_donations_same_category: number;
    }
  | {
      weights: {
        severity: number;
        marginal_impact: number;
        evidence_quality: number;
        category_fit: number;
      };
      amount_sizing: "llm_judges";
      max_donations_per_day: number;
      min_days_between_donations_same_category: number;
    };

export type Persona = {
  identity: {
    display_name: string;
    creature_type: string;
    vibe: string;
    mission: string;
    values: string;
    preferred_categories: string[];
  };
  budget: {
    monthly_usdc: number;
    min_donation_usdc: number;
    max_donation_usdc: number;
    reserve_fraction: number;
  };
  evidence_access: EvidenceAccess;
  decision_framework: DecisionFramework;
};

export type AgentState = {
  api_key: string;
  agent_id: string;
  wallet_address: string;
  current_month_key: string;
  monthly_spent_usdc: number;
  monthly_evidence_spent_usdc: number;
  last_donation_by_category: Record<string, string>;
  donations_today_count: number;
  today_key: string;
};

export type EvidenceDocument = {
  document_id: string;
  document_type: string;
  mime_type?: string;
  file_size_bytes?: number;
  submitted_at: string;
  status?: "available" | "removed";
  deleted_at?: string;
};

export type EvidenceData = {
  documents: EvidenceDocument[];
  fetched_via: "mcp_free" | "x402_paid";
  settled_amount_usdc?: number;
  tx_hash?: string;
};

export type EvidenceSummary = {
  document_types: Record<string, number>;
  total_documents: number;
  total_size_bytes: number;
  most_recent_upload: string | null;
};

export type Campaign = {
  campaign_id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  location_country: string;
  goal_amount: number;
  funded_amount: number;
  creator_wallet_address: string;
  evidence_summary?: EvidenceSummary | null;
  verified_by?: string;
  status: string;
};

export type CampaignScores = {
  severity: number;
  marginal_impact: number;
  evidence_quality: number;
  category_fit: number;
};

export type CampaignJustifications = {
  severity: string;
  marginal_impact: string;
  evidence_quality: string;
  category_fit: string;
};

export type ScoredCampaign = Campaign & {
  scores: CampaignScores;
  justifications: CampaignJustifications;
  weighted_score: number;
  suggested_amount_usdc: number;
};

export type DonationDecision = {
  winner: ScoredCampaign;
  amount_usdc: number;
  reasoning: string;
};
