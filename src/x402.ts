import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { registerExactEvmScheme } from "@x402/evm/exact/client";

import { getX402Signer } from "./wallet.js";

type FetchWithPayment = ReturnType<typeof wrapFetchWithPayment>;

let fetchWithPaymentPromise: Promise<FetchWithPayment> | null = null;

async function getFetchWithPayment(): Promise<FetchWithPayment> {
  if (!fetchWithPaymentPromise) {
    fetchWithPaymentPromise = (async () => {
      const signer = await getX402Signer();
      const client = new x402Client();

      registerExactEvmScheme(client, { signer });

      return wrapFetchWithPayment(fetch, client);
    })();
  }

  return fetchWithPaymentPromise;
}

function parseSettledAmountUsdc(decoded: object): number | null {
  const rawAmount = (decoded as { amount?: unknown }).amount;

  if (typeof rawAmount === "number" && Number.isFinite(rawAmount)) {
    return rawAmount / 1_000_000;
  }

  if (typeof rawAmount === "string" && rawAmount.trim() !== "") {
    const parsed = Number(rawAmount);

    if (Number.isFinite(parsed)) {
      return parsed / 1_000_000;
    }
  }

  return null;
}

export async function fetchEvidenceViaX402(
  x402_endpoint: string,
  apiKey: string,
): Promise<{
  evidence_documents: unknown[];
  settled_amount_usdc: number | null;
  tx_hash: string | null;
}> {
  const fetchWithPayment = await getFetchWithPayment();
  const response = await fetchWithPayment(x402_endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.status === 401) {
    throw new Error("Evidence x402: agent authentication rejected");
  }

  if (response.status === 403) {
    throw new Error(
      "Evidence x402: agent not eligible for evidence access (volume threshold not met)",
    );
  }

  if (response.status === 402) {
    throw new Error(
      `Evidence x402: payment challenge not satisfied  ${response.statusText}`,
    );
  }

  if (response.status >= 500) {
    throw new Error(`Evidence x402: server error ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(`Evidence x402: unexpected status ${response.status}`);
  }

  const body = (await response.json()) as { evidence_documents?: unknown };

  if (!Array.isArray(body.evidence_documents)) {
    throw new Error("Evidence x402: invalid response body");
  }

  const paymentResponseHeader =
    response.headers.get("PAYMENT-RESPONSE") ??
    response.headers.get("X-PAYMENT-RESPONSE");

  if (!paymentResponseHeader) {
    return {
      evidence_documents: body.evidence_documents,
      settled_amount_usdc: null,
      tx_hash: null,
    };
  }

  try {
    const decoded = decodePaymentResponseHeader(paymentResponseHeader);

    return {
      evidence_documents: body.evidence_documents,
      settled_amount_usdc: parseSettledAmountUsdc(decoded),
      tx_hash: typeof decoded.transaction === "string" ? decoded.transaction : null,
    };
  } catch {
    return {
      evidence_documents: body.evidence_documents,
      settled_amount_usdc: null,
      tx_hash: null,
    };
  }
}
