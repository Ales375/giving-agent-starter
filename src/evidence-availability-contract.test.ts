import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getCampaignResponseSchema,
  searchCampaignsResponseSchema,
} from "./mcp.js";

const decisionSource = await readFile(new URL("./decision.ts", import.meta.url), "utf8");

function campaign(count: number, hasEvidence = count > 0) {
  return {
    campaign_id: "campaign-id",
    title: "Campaign",
    description: "Creator-supplied campaign description",
    category: "medical_emergency",
    location: null,
    location_country: null,
    goal_amount: 100,
    funded_amount: 10,
    creator_wallet_address: "0x0000000000000000000000000000000000000001",
    evidence_document_count: count,
    has_evidence: hasEvidence,
    evidence_layer_status: count > 0 ? "partial" : "empty",
    status: "active",
    creator_email: "must-not-survive@example.test",
    file_reference: "private/path.pdf",
  };
}

test("search parser accepts zero, one, and many factual counts with legacy compatibility", () => {
  for (const count of [0, 1, 4]) {
    const parsed = searchCampaignsResponseSchema.parse({
      campaigns: [campaign(count)],
      total_matching: 1,
    });

    assert.equal(parsed.campaigns[0].evidence_document_count, count);
    assert.equal(parsed.campaigns[0].has_evidence, count > 0);
    assert.equal("creator_email" in parsed.campaigns[0], false);
    assert.equal("file_reference" in parsed.campaigns[0], false);
  }
});

test("search parser rejects fractional counts and boolean disagreement", () => {
  assert.throws(() => searchCampaignsResponseSchema.parse({
    campaigns: [campaign(1.5, true)],
    total_matching: 1,
  }));
  assert.throws(() => searchCampaignsResponseSchema.parse({
    campaigns: [campaign(0, true)],
    total_matching: 1,
  }));
});

test("detail parser requires the factual count to match evidence_summary", () => {
  const valid = {
    campaign: campaign(2),
    funding_progress: { goal_amount: 100, funded_amount: 10, percent_funded: 10 },
    evidence_summary: {
      document_types: { medical_document: 2 },
      total_documents: 2,
      total_size_bytes: 1234,
      most_recent_upload: "2026-08-12T00:00:00.000Z",
    },
  };

  assert.equal(getCampaignResponseSchema.parse(valid).campaign.evidence_document_count, 2);
  assert.throws(() => getCampaignResponseSchema.parse({
    ...valid,
    evidence_summary: { ...valid.evidence_summary, total_documents: 1 },
  }));
});

test("shortlisting treats document availability as factual rather than credibility", () => {
  assert.match(decisionSource, /absence of current evidence documents as an availability fact/i);
  assert.match(decisionSource, /not evidence that a campaign is false or less credible/i);
  assert.doesNotMatch(decisionSource, /absence of evidence as a credibility limitation/i);
});
