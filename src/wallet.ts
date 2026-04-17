import { CdpClient, parseUnits } from "@coinbase/cdp-sdk";
import { formatUnits, isAddress, type Address } from "viem";
import { toAccount, type LocalAccount } from "viem/accounts";

const BASE_MAINNET_NETWORK = "base";
const USDC_DECIMALS = 6;
const BASE_MAINNET_USDC_CONTRACT =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

const CDP_API_KEY_ID = requireEnv("CDP_API_KEY_ID");
const CDP_API_KEY_SECRET = requireEnv("CDP_API_KEY_SECRET");
const CDP_ACCOUNT_NAME = requireEnv("CDP_ACCOUNT_NAME");
const CDP_WALLET_SECRET = requireEnv("CDP_WALLET_SECRET");

const cdp = new CdpClient({
  apiKeyId: CDP_API_KEY_ID,
  apiKeySecret: CDP_API_KEY_SECRET,
  walletSecret: CDP_WALLET_SECRET,
});

let accountPromise: Promise<Awaited<ReturnType<typeof cdp.evm.getOrCreateAccount>>> | null =
  null;

async function getAccount() {
  if (!accountPromise) {
    accountPromise = cdp.evm.getOrCreateAccount({ name: CDP_ACCOUNT_NAME });
  }

  return accountPromise;
}

function toUsdcAtomicUnits(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("USDC amount must be a positive number");
  }

  return parseUnits(amount.toFixed(USDC_DECIMALS), USDC_DECIMALS);
}

export async function getWalletAddress(): Promise<string> {
  const account = await getAccount();
  return account.address;
}

export async function getX402Signer(): Promise<LocalAccount> {
  const account = await getAccount();
  return toAccount(account);
}

export async function sendUSDC(to: string, amount: number): Promise<string> {
  if (!isAddress(to)) {
    throw new Error("Recipient wallet address must be a valid EVM address");
  }

  const account = await getAccount();
  const baseAccount = await account.useNetwork(BASE_MAINNET_NETWORK);
  const transferResult = await baseAccount.transfer({
    to: to as Address,
    amount: toUsdcAtomicUnits(amount),
    token: "usdc",
  });

  return transferResult.transactionHash;
}

export async function getUSDCBalance(): Promise<number> {
  const account = await getAccount();
  const baseAccount = await account.useNetwork(BASE_MAINNET_NETWORK);

  let pageToken: string | undefined;

  do {
    const result = await baseAccount.listTokenBalances({ pageToken });
    const usdcBalance = result.balances.find(
      (balance) =>
        balance.token.contractAddress.toLowerCase() ===
        BASE_MAINNET_USDC_CONTRACT.toLowerCase(),
    );

    if (usdcBalance) {
      return Number(formatUnits(usdcBalance.amount.amount, USDC_DECIMALS));
    }

    pageToken = result.nextPageToken;
  } while (pageToken);

  return 0;
}
