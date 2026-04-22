import { loadPersona } from "./persona.js";
import {
  readState,
  writeState,
  resetBudgetIfNewMonth,
  resetDayCounterIfNewDay,
} from "./state.js";
import {
  registerAgent,
  getPlatformOverview,
  searchCampaigns,
  getCampaign,
  getCampaignDonations,
  getEvidence,
  donate,
  confirmDonation,
} from "./mcp.js";
import { getWalletAddress, sendUSDC } from "./wallet.js";
import { fetchEvidenceViaX402 } from "./x402.js";
import {
  shortlistCampaigns,
  shouldFetchEvidence,
  scoreCampaigns,
  selectWinner,
  sizeDonation,
  generateReasoning,
} from "./decision.js";
import {
  extractEvidenceDocuments,
  type EvidenceExtractionResult,
} from "./evidence.js";
import {
  checkPreDecisionGates,
  checkPostDecisionGates,
  canAffordEvidence,
  recordDonation,
  recordEvidencePayment,
} from "./budget.js";
import type { AgentState, Campaign, EvidenceData, EvidenceSummary } from "./types.js";

type EvidenceDataWithExtractions = EvidenceData & {
  extracted_documents: EvidenceExtractionResult[];
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function getCurrentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function getTodayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseDryRunFlag(): boolean {
  return process.env.DRY_RUN === "true";
}

function getPersonaPath(): string {
  const personaPath = process.env.PERSONA_PATH?.trim();

  return personaPath && personaPath.length > 0 ? personaPath : "./persona.yaml";
}

function extractOverviewNumber(
  overview: unknown,
  keys: string[],
): number | "unknown" {
  if (typeof overview !== "object" || overview === null) {
    return "unknown";
  }

  for (const key of keys) {
    const value = (overview as Record<string, unknown>)[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return "unknown";
}

function parseEvidencePrice(price: unknown): number {
  if (typeof price === "number" && Number.isFinite(price)) {
    return price;
  }

  if (typeof price === "string") {
    const cleaned = price.replace(/[^0-9.]/g, "");
    const parsed = Number.parseFloat(cleaned);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Unable to parse evidence price: ${String(price)}`);
}

function normalizeEvidenceSummary(value: unknown): EvidenceSummary | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const summary = value as Record<string, unknown>;
  const documentTypes = summary.document_types;

  if (
    typeof documentTypes !== "object" ||
    documentTypes === null ||
    Array.isArray(documentTypes) ||
    typeof summary.total_documents !== "number" ||
    typeof summary.total_size_bytes !== "number" ||
    (typeof summary.most_recent_upload !== "string" &&
      summary.most_recent_upload !== null)
  ) {
    return undefined;
  }

  const normalizedDocumentTypes: Record<string, number> = {};

  for (const [key, count] of Object.entries(documentTypes)) {
    if (typeof count !== "number") {
      return undefined;
    }

    normalizedDocumentTypes[key] = count;
  }

  return {
    document_types: normalizedDocumentTypes,
    total_documents: summary.total_documents,
    total_size_bytes: summary.total_size_bytes,
    most_recent_upload: summary.most_recent_upload,
  };
}

function normalizeCampaign(campaign: {
  campaign_id: string;
  title: string;
  description: string;
  category: string;
  location?: string | null;
  location_country?: string | null;
  goal_amount: number;
  funded_amount: number;
  creator_wallet_address?: string;
  evidence_summary?: unknown;
  verified_by?: string | null;
  status: string;
}): Campaign {
  return {
    campaign_id: campaign.campaign_id,
    title: campaign.title,
    description: campaign.description,
    category: campaign.category,
    location: campaign.location ?? "",
    location_country: campaign.location_country ?? "",
    goal_amount: campaign.goal_amount,
    funded_amount: campaign.funded_amount,
    creator_wallet_address: campaign.creator_wallet_address ?? "",
    evidence_summary: normalizeEvidenceSummary(campaign.evidence_summary),
    verified_by: campaign.verified_by ?? undefined,
    status: campaign.status,
  };
}

function previewReasoning(reasoning: string): string {
  return reasoning.length <= 100 ? reasoning : `${reasoning.slice(0, 100)}...`;
}

function normalizeEvidenceDocuments(
  documents: unknown,
): EvidenceData["documents"] {
  if (!Array.isArray(documents)) {
    return [];
  }

  const normalized: EvidenceData["documents"] = [];

  for (const [index, document] of documents.entries()) {
    if (typeof document !== "object" || document === null) {
      console.warn(`WARN Skipping malformed evidence document at index ${index}.`);
      continue;
    }

    const value = document as Record<string, unknown>;
    const documentId = value.document_id;
    const documentType = value.document_type;
    const submittedAt = value.submitted_at;

    if (
      typeof documentId !== "string" ||
      documentId.trim() === "" ||
      typeof documentType !== "string" ||
      documentType.trim() === "" ||
      typeof submittedAt !== "string" ||
      submittedAt.trim() === ""
    ) {
      console.warn(`WARN Skipping malformed evidence document at index ${index}.`);
      continue;
    }

    normalized.push({
      document_id: documentId,
      document_type: documentType,
      submitted_at: submittedAt,
      mime_type: typeof value.mime_type === "string" ? value.mime_type : undefined,
      file_size_bytes:
        typeof value.file_size_bytes === "number" ? value.file_size_bytes : undefined,
      status:
        value.status === "available" || value.status === "removed"
          ? value.status
          : undefined,
      deleted_at:
        typeof value.deleted_at === "string" ? value.deleted_at : undefined,
      signed_url:
        typeof value.signed_url === "string" || value.signed_url === null
          ? value.signed_url
          : undefined,
      signed_url_expires_at:
        typeof value.signed_url_expires_at === "string" ||
        value.signed_url_expires_at === null
          ? value.signed_url_expires_at
          : undefined,
      file_reference:
        typeof value.file_reference === "string" ? value.file_reference : undefined,
    });
  }

  return normalized;
}

function summarizeDryRunEvidence(
  campaign: Campaign,
  evidenceData: EvidenceDataWithExtractions,
) {
  return {
    campaign_title: campaign.title,
    fetched_via: evidenceData.fetched_via,
    total_document_count: evidenceData.documents.length,
    documents: evidenceData.documents.map((document) => {
      const extraction = evidenceData.extracted_documents.find(
        (result) => result.document_id === document.document_id,
      );

      return {
        document_id: document.document_id,
        document_type: document.document_type,
        mime_type: document.mime_type ?? null,
        status: document.status ?? null,
        signed_url_present: document.signed_url != null,
        extraction_status: extraction?.status ?? null,
        extracted_text_length:
          extraction?.status === "extracted" ? extraction.text?.length ?? 0 : null,
        extraction_reason:
          extraction && extraction.status !== "extracted"
            ? extraction.reason ?? null
            : null,
      };
    }),
  };
}

function logDryRunEvidenceDebug(
  campaign: Campaign,
  evidenceData: EvidenceDataWithExtractions,
): void {
  console.log(
    `DRY Evidence returned/extracted:\n${JSON.stringify(
      summarizeDryRunEvidence(campaign, evidenceData),
      null,
      2,
    )}`,
  );
}

async function main(): Promise<void> {
  const dryRun = parseDryRunFlag();
  console.log(`OK cycle start${dryRun ? " (dry run)" : ""}`);

  let persona;

  try {
    persona = loadPersona(getPersonaPath());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERR persona validation failed: ${message}`);
    process.exit(1);
  }

  let state = readState();

  if (state === null) {
    const walletAddress = await getWalletAddress();
    const registration = await registerAgent({
      display_name: persona.identity.display_name,
      mission: persona.identity.mission,
      wallet_address: walletAddress,
      creature_type: persona.identity.creature_type,
      vibe: persona.identity.vibe,
      values: persona.identity.values,
      preferred_categories: persona.identity.preferred_categories,
    });

    state = {
      api_key: registration.api_key,
      agent_id: registration.agent_id,
      wallet_address: walletAddress,
      current_month_key: getCurrentMonthKey(),
      monthly_spent_usdc: 0,
      monthly_evidence_spent_usdc: 0,
      last_donation_by_category: {},
      donations_today_count: 0,
      today_key: getTodayKey(),
    };

    writeState(state);
    console.log(
      `OK Registered new agent: ${persona.identity.display_name} (${registration.agent_id}) at wallet ${walletAddress}. State file created.`,
    );
  }

  let nextState = resetBudgetIfNewMonth(state);
  nextState = resetDayCounterIfNewDay(nextState);

  if (nextState !== state) {
    state = nextState;
    writeState(state);
    console.log("OK State counters reset for current day/month window.");
  } else {
    state = nextState;
  }

  const preGate = checkPreDecisionGates(state, persona);

  if (!preGate.proceed) {
    console.log(`SKIP Skipping this cycle: ${preGate.reason}`);
    process.exit(0);
  }

  const platformOverview = await getPlatformOverview();
  const activeCampaignCount = extractOverviewNumber(platformOverview, [
    "active_campaigns_count",
    "active_campaigns",
  ]);
  const totalDonated = extractOverviewNumber(platformOverview, [
    "total_donated",
    "total_donated_usdc",
  ]);
  console.log(
    `OK Platform overview: active campaigns ${activeCampaignCount}, total donated ${totalDonated}.`,
  );

  const searchParams = {
    category: undefined,
    max_funded_percent: 95,
    status: "active",
    sort_by: "created_at",
    sort_order: "desc",
    limit: 50,
  };
  const searchResult = await searchCampaigns(searchParams);
  console.log(
    `OK Search returned ${searchResult.campaigns.length} campaigns from ${searchResult.total_matching} matches.`,
  );

  if (searchResult.campaigns.length === 0) {
    console.log("SKIP No campaigns match search");
    process.exit(0);
  }

  const searchCampaignsNormalized = searchResult.campaigns.map(normalizeCampaign);
  const shortlistSeed = shortlistCampaigns(searchCampaignsNormalized, persona);

  if (shortlistSeed.length === 0) {
    console.log("SKIP No campaigns pass shortlist");
    process.exit(0);
  }

  console.log(
    `OK Shortlist (${shortlistSeed.length}): ${shortlistSeed.map((campaign) => campaign.title).join(", ")}`,
  );

  const shortlist: Campaign[] = [];

  for (const campaign of shortlistSeed) {
    const fullCampaign = await getCampaign(campaign.campaign_id);
    shortlist.push(
      normalizeCampaign({
        ...fullCampaign.campaign,
        evidence_summary: fullCampaign.evidence_summary,
      }),
    );
  }

  const evidenceMap = new Map<string, EvidenceDataWithExtractions>();

  for (const [index, campaign] of shortlist.entries()) {
    if (!shouldFetchEvidence(campaign, persona, index)) {
      continue;
    }

    try {
      const evidenceResponse = await getEvidence(campaign.campaign_id, state.api_key);

      if ("evidence_documents" in evidenceResponse) {
        const documents = normalizeEvidenceDocuments(evidenceResponse.evidence_documents);
        const extractedDocuments = await extractEvidenceDocuments(documents);
        const evidenceData: EvidenceDataWithExtractions = {
          documents,
          fetched_via: "mcp_free",
          extracted_documents: extractedDocuments,
        };

        evidenceMap.set(campaign.campaign_id, evidenceData);
        if (dryRun) {
          logDryRunEvidenceDebug(campaign, evidenceData);
        }
        console.log(`OK Free evidence fetched for ${campaign.title}.`);
        continue;
      }

      if (
        "eligibility_status" in evidenceResponse &&
        evidenceResponse.eligibility_status === "not_eligible"
      ) {
        console.log(
          `SKIP Evidence not eligible for ${campaign.title} (insufficient donation volume)`,
        );
        continue;
      }

      if ("status" in evidenceResponse && evidenceResponse.status === "payment_required") {
        const price = parseEvidencePrice(evidenceResponse.price);

        if (!canAffordEvidence(state, persona, price)) {
          console.log(`SKIP Evidence priced ${price} exceeds persona cap`);
          continue;
        }

        const x402Result = await fetchEvidenceViaX402(
          String(evidenceResponse.x402_endpoint),
          state.api_key,
        );

        state = recordEvidencePayment(
          state,
          x402Result.settled_amount_usdc ?? price,
        );
        writeState(state);

        const documents = normalizeEvidenceDocuments(x402Result.evidence_documents);
        const extractedDocuments = await extractEvidenceDocuments(documents);
        const evidenceData: EvidenceDataWithExtractions = {
          documents,
          fetched_via: "x402_paid",
          settled_amount_usdc: x402Result.settled_amount_usdc ?? undefined,
          tx_hash: x402Result.tx_hash ?? undefined,
          extracted_documents: extractedDocuments,
        };

        evidenceMap.set(campaign.campaign_id, evidenceData);
        if (dryRun) {
          logDryRunEvidenceDebug(campaign, evidenceData);
        }

        console.log(
          `OK Paid evidence fetched for ${campaign.title} at ${x402Result.settled_amount_usdc ?? price} USDC.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ERR Evidence fetch failed for ${campaign.title}: ${message}`);
    }
  }

  // TODO: Pass peer donation signal into scoreCampaigns in v0.2.0 once the scoring
  // prompt and function signature are expanded for donation reasoning context.
  for (const campaign of shortlist) {
    try {
      const donations = await getCampaignDonations(campaign.campaign_id, 5);
      console.log(
        `OK Peer signal for ${campaign.title}: ${donations.donations.length} recent donations loaded.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ERR Failed to load peer donations for ${campaign.title}: ${message}`);
    }
  }

  const scored = await scoreCampaigns(shortlist, evidenceMap, persona);

  for (const campaign of scored) {
    console.log(
      `OK Scored ${campaign.title}: weighted ${campaign.weighted_score.toFixed(2)}.`,
    );
  }

  const winner = selectWinner(scored, persona);
  console.log(
    `OK Winner selected: ${winner.title} (severity ${winner.scores.severity}/10, marginal ${winner.scores.marginal_impact}/10, evidence ${winner.scores.evidence_quality}/10, fit ${winner.scores.category_fit}/10).`,
  );

  const amount = await sizeDonation(winner, persona);
  console.log(`OK Sized donation: $${amount.toFixed(2)} USDC.`);

  const reasoning = await generateReasoning(winner, amount, persona);
  console.log(`OK Reasoning preview: ${previewReasoning(reasoning)}`);

  const postGate = checkPostDecisionGates(state, persona, winner, amount);

  if (!postGate.proceed) {
    console.log(`SKIP Decision blocked post-scoring: ${postGate.reason}`);
    process.exit(0);
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          campaign_id: winner.campaign_id,
          title: winner.title,
          amount_usdc: amount,
          reasoning,
          scores: winner.scores,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const paymentInstructions = await donate(
    {
      campaign_id: winner.campaign_id,
      amount,
      reasoning,
    },
    state.api_key,
  );
  const serverAmount = paymentInstructions.amount;

  if (!Number.isFinite(serverAmount)) {
    throw new Error(
      `Donation payment instructions returned an invalid amount: ${String(paymentInstructions.amount)}`,
    );
  }

  const amountDivergence = Math.abs(serverAmount - amount);

  if (amountDivergence > 0.01) {
    throw new Error(
      `Donation payment instruction amount mismatch: local $${amount.toFixed(2)} vs server $${serverAmount.toFixed(2)}`,
    );
  }

  if (amountDivergence > 0) {
    console.warn(
      `WARN Donation payment instruction amount adjusted: local $${amount.toFixed(2)} vs server $${serverAmount.toFixed(2)}`,
    );
  }

  if (paymentInstructions.network !== "base") {
    throw new Error(
      `Unsupported payment network from zooidfund: ${paymentInstructions.network}. This starter only supports base for live donations.`,
    );
  }

  if (paymentInstructions.currency.toLowerCase() !== "usdc") {
    throw new Error(
      `Unsupported payment currency from zooidfund: ${paymentInstructions.currency}. This starter only supports USDC for live donations.`,
    );
  }

  console.log(
    `OK Paying to ${paymentInstructions.wallet_address} on ${paymentInstructions.network}.`,
  );

  const txHash = await sendUSDC(paymentInstructions.wallet_address, serverAmount);
  console.log(`OK On-chain transfer sent: ${txHash}`);

  const confirmation = await confirmDonation(
    {
      campaign_id: winner.campaign_id,
      amount: serverAmount,
      reasoning,
      tx_hash: txHash,
    },
    state.api_key,
  );
  console.log(`OK Donation confirmed: ${confirmation.donation_id}`);

  state = recordDonation(state, serverAmount, winner.category);
  writeState(state);

  console.log("OK Donation complete");
  console.log(`OK Campaign: ${winner.title}`);
  console.log(`OK Amount: $${serverAmount.toFixed(2)} USDC`);
  console.log(`OK Tx: ${txHash}`);
  console.log(`OK Reasoning: ${reasoning}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERR ${message}`);
  process.exit(1);
});
