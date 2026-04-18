import { experimental_createMCPClient } from "@ai-sdk/mcp";
import { z } from "zod";

const registerAgentParamsSchema = z.object({
  display_name: z.string(),
  mission: z.string(),
  wallet_address: z.string(),
  creature_type: z.string().optional(),
  vibe: z.string().optional(),
  values: z.string().optional(),
  preferred_categories: z.array(z.string()).optional(),
});

const registerAgentResponseSchema = z.object({
  agent_id: z.string(),
  api_key: z.string(),
});

const platformOverviewSchema = z.object({}).catchall(z.unknown());

const searchCampaignsParamsSchema = z.object({
  category: z.string().optional(),
  country: z.string().optional(),
  status: z.string().optional(),
  max_funded_percent: z.number().optional(),
  min_funding_gap: z.number().optional(),
  verified_only: z.boolean().optional(),
  keyword: z.string().optional(),
  sort_by: z.string().optional(),
  sort_order: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

const evidenceSummarySchema = z.object({
  document_types: z.record(z.string(), z.number()),
  total_documents: z.number(),
  total_size_bytes: z.number(),
  most_recent_upload: z.string().nullable(),
});

const campaignSchema = z.object({
  campaign_id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  location: z.string().nullable().optional(),
  location_country: z.string().nullable().optional(),
  goal_amount: z.number(),
  funded_amount: z.number(),
  creator_wallet_address: z.string(),
  evidence_summary: evidenceSummarySchema.nullable().optional(),
  verified_by: z.string().nullable().optional(),
  status: z.string(),
});

const fundingProgressSchema = z.object({
  goal_amount: z.number(),
  funded_amount: z.number(),
  percent_funded: z.number(),
});

const getCampaignResponseSchema = z.object({
  campaign: z.object({
    campaign_id: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.string(),
    location: z.string().nullable().optional(),
    location_country: z.string().nullable().optional(),
    goal_amount: z.number(),
    funded_amount: z.number(),
    creator_wallet_address: z.string(),
    status: z.string(),
  }),
  funding_progress: fundingProgressSchema,
  evidence_summary: evidenceSummarySchema,
});

const searchCampaignsResponseSchema = z.object({
  campaigns: z.array(campaignSchema),
  total_matching: z.number(),
});

const donationListSchema = z.object({
  donations: z.array(z.object({}).catchall(z.unknown())),
  total_donations: z.number(),
});

const evidenceDocumentSchema = z
  .object({
    document_id: z.string(),
    document_type: z.string(),
    submitted_at: z.string(),
    mime_type: z.string().optional(),
    file_size_bytes: z.number().optional(),
    status: z.enum(["available", "removed"]).optional(),
    deleted_at: z.string().optional(),
  })
  .catchall(z.unknown());

const evidenceResponseSchema = z.union([
  z.object({
    evidence_documents: z.array(evidenceDocumentSchema),
  }),
  z
    .object({
      eligibility_status: z.literal("not_eligible"),
    })
    .catchall(z.unknown()),
  z.object({
    status: z.literal("payment_required"),
    x402_endpoint: z.string(),
    price: z.number(),
    currency: z.string(),
  }),
]);

const donateParamsSchema = z.object({
  campaign_id: z.string(),
  amount: z.number(),
  reasoning: z.string(),
});

const donateResponseSchema = z.object({
  wallet_address: z.string(),
  amount: z.number(),
  network: z.string(),
  currency: z.string(),
});

const confirmDonationParamsSchema = z.object({
  campaign_id: z.string(),
  amount: z.number(),
  reasoning: z.string(),
  tx_hash: z.string(),
});

const confirmDonationResponseSchema = z.object({
  donation_id: z.string(),
  status: z.string(),
  tx_hash: z.string(),
});

type RegisterAgentParams = z.infer<typeof registerAgentParamsSchema>;
type RegisterAgentResponse = z.infer<typeof registerAgentResponseSchema>;
type PlatformOverview = z.infer<typeof platformOverviewSchema>;
type SearchCampaignsParams = z.infer<typeof searchCampaignsParamsSchema>;
type SearchCampaignsResponse = z.infer<typeof searchCampaignsResponseSchema>;
type GetCampaignResponse = z.infer<typeof getCampaignResponseSchema>;
type CampaignDonationsResponse = z.infer<typeof donationListSchema>;
type EvidenceResponse = z.infer<typeof evidenceResponseSchema>;
type DonateParams = z.infer<typeof donateParamsSchema>;
type DonateResponse = z.infer<typeof donateResponseSchema>;
type ConfirmDonationParams = z.infer<typeof confirmDonationParamsSchema>;
type ConfirmDonationResponse = z.infer<typeof confirmDonationResponseSchema>;

type ExecutableTool = {
  execute: (input: unknown) => Promise<unknown>;
};

function getMcpUrl(): string {
  const url = process.env.ZOOID_MCP_URL;

  if (!url) {
    throw new Error("ZOOID_MCP_URL environment variable is required");
  }

  return url;
}

async function createClient(apiKey?: string) {
  return experimental_createMCPClient({
    transport: {
      type: "http",
      url: getMcpUrl(),
      ...(apiKey
        ? {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        : {}),
    },
  });
}

function normalizeToolResult(result: unknown): unknown {
  if (
    typeof result === "object" &&
    result !== null &&
    "structuredContent" in result &&
    result.structuredContent !== undefined
  ) {
    return result.structuredContent;
  }

  return result;
}

async function invokeTool<TParams, TResult>(
  toolName: string,
  params: TParams,
  responseSchema: z.ZodType<TResult>,
  apiKey?: string,
): Promise<TResult> {
  const client = await createClient(apiKey);

  try {
    const tools = (await client.tools()) as Record<string, unknown>;
    const tool = tools[toolName] as ExecutableTool | undefined;

    if (!tool || typeof tool.execute !== "function") {
      throw new Error(`MCP tool "${toolName}" is not available`);
    }

    const rawResult = await tool.execute(params);
    return responseSchema.parse(normalizeToolResult(rawResult));
  } finally {
    await client.close();
  }
}

export async function registerAgent(
  params: RegisterAgentParams,
): Promise<RegisterAgentResponse> {
  return invokeTool(
    "register_agent",
    registerAgentParamsSchema.parse(params),
    registerAgentResponseSchema,
  );
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  return invokeTool("get_platform_overview", {}, platformOverviewSchema);
}

export async function searchCampaigns(
  params: SearchCampaignsParams,
): Promise<SearchCampaignsResponse> {
  return invokeTool(
    "search_campaigns",
    searchCampaignsParamsSchema.parse(params),
    searchCampaignsResponseSchema,
  );
}

export async function getCampaign(
  campaign_id: string,
): Promise<GetCampaignResponse> {
  return invokeTool(
    "get_campaign",
    { campaign_id: z.string().parse(campaign_id) },
    getCampaignResponseSchema,
  );
}

export async function getCampaignDonations(
  campaign_id: string,
  limit?: number,
): Promise<CampaignDonationsResponse> {
  return invokeTool(
    "get_campaign_donations",
    {
      campaign_id: z.string().parse(campaign_id),
      ...(limit === undefined ? {} : { limit: z.number().parse(limit) }),
    },
    donationListSchema,
  );
}

export async function getEvidence(
  campaign_id: string,
  apiKey: string,
): Promise<EvidenceResponse> {
  return invokeTool(
    "get_evidence",
    { campaign_id: z.string().parse(campaign_id) },
    evidenceResponseSchema,
    z.string().min(1).parse(apiKey),
  );
}

export async function donate(
  params: DonateParams,
  apiKey: string,
): Promise<DonateResponse> {
  return invokeTool(
    "donate",
    donateParamsSchema.parse(params),
    donateResponseSchema,
    z.string().min(1).parse(apiKey),
  );
}

export async function confirmDonation(
  params: ConfirmDonationParams,
  apiKey: string,
): Promise<ConfirmDonationResponse> {
  return invokeTool(
    "confirm_donation",
    confirmDonationParamsSchema.parse(params),
    confirmDonationResponseSchema,
    z.string().min(1).parse(apiKey),
  );
}
