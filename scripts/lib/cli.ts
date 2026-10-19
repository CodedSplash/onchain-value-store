// Shared plumbing for the management scripts (npm run get / set-string / ...).
// Usage pattern: npm run <script> -- [positional args] [--network sepolia|hoodi|localhost] [--account N]
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { Wallet, type Signer, type TransactionReceipt } from "ethers";

import {
  ContractRevertError,
  ValueStoreError,
  ValueStoreReader,
  ValueStoreWriter,
  createProvider,
} from "../../client/index.js";
import { loadDeployment, type DeploymentRecord } from "./deployments.js";
import { assertAllowedNetwork, type AllowedNetwork } from "./networks.js";

try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on the process environment
}

const RPC_URL_ENV: Record<string, string> = { sepolia: "SEPOLIA_RPC_URL", hoodi: "HOODI_RPC_URL" };
const LOCAL_RPC_URL = "http://127.0.0.1:8545";

export interface CliContext {
  readonly networkName: string;
  readonly network: AllowedNetwork;
  readonly deployment: DeploymentRecord;
  readonly rpcUrl: string;
  readonly positionals: readonly string[];
  /** AES key from VALUESTORE_KEY or VALUESTORE_KEY_FILE, if any. */
  readonly key: string | undefined;
  readonly reader: ValueStoreReader;
  /** Writer for the configured wallet (created on first use). */
  writer(): Promise<ValueStoreWriter>;
}

/** Parses CLI flags, loads the deployment record and checks the chain id. */
export async function createContext(): Promise<CliContext> {
  const { values, positionals } = parseArgs({
    options: {
      network: { type: "string", default: "sepolia" },
      account: { type: "string", default: "0" },
    },
    allowPositionals: true,
  });
  const networkName = values.network;
  const deployment = loadDeployment(networkName);
  const rpcUrl = resolveRpcUrl(networkName);
  const provider = createProvider(rpcUrl);

  const { chainId } = await provider.getNetwork();
  const network = assertAllowedNetwork(chainId);
  if (chainId.toString() !== deployment.chainId) {
    throw new ValueStoreError(
      `RPC is on chainId ${chainId}, but deployments/${networkName}.json is for chainId ${deployment.chainId}.`,
    );
  }

  const key = readKey();
  const reader = ValueStoreReader.connect({ provider, address: deployment.address, key });
  let writer: ValueStoreWriter | undefined;
  return {
    networkName,
    network,
    deployment,
    rpcUrl,
    positionals,
    key,
    reader,
    async writer() {
      writer ??= ValueStoreWriter.connect({
        provider,
        address: deployment.address,
        key,
        signer: await resolveSigner(network, provider, values.account),
      });
      return writer;
    },
  };
}

/** Returns positional argument `index` or exits with a usage message. */
export function requireArg(ctx: CliContext, index: number, usage: string): string {
  const value = ctx.positionals[index];
  if (value === undefined || value === "") throw new ValueStoreError(`Missing argument. Usage: ${usage}`);
  return value;
}

/** Prints the outcome of a write transaction. */
export async function printReceipt(ctx: CliContext, action: string, receipt: TransactionReceipt): Promise<void> {
  console.log(`${action}: tx ${receipt.hash} (block ${receipt.blockNumber})`);
  console.log(`revision is now ${await ctx.reader.getRevision()}`);
  if (ctx.network.explorer) console.log(`${ctx.network.explorer}/tx/${receipt.hash}`);
}

/** Runs a script body and turns errors into a readable message and exit code 1. */
export async function run(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    if (error instanceof ContractRevertError) {
      console.error(`Contract rejected the transaction: ${error.errorName}(${error.errorArgs.join(", ")})`);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exitCode = 1;
  }
}

function resolveRpcUrl(networkName: string): string {
  if (networkName === "localhost") return LOCAL_RPC_URL;
  const envName = RPC_URL_ENV[networkName];
  if (!envName) throw new ValueStoreError(`Unknown network "${networkName}". Use sepolia, hoodi or localhost.`);
  const url = (process.env[envName] ?? "").trim();
  if (url === "") throw new ValueStoreError(`${envName} is not set in .env.`);
  return url;
}

function readKey(): string | undefined {
  const inline = (process.env.VALUESTORE_KEY ?? "").trim();
  if (inline !== "") return inline;
  const file = (process.env.VALUESTORE_KEY_FILE ?? "").trim();
  return file === "" ? undefined : readFileSync(file, "utf8").trim();
}

/**
 * Local node: one of its unlocked dev accounts (`--account N`, default 0).
 * Public testnets: the PRIVATE_KEY wallet from .env.
 */
async function resolveSigner(
  network: AllowedNetwork,
  provider: ReturnType<typeof createProvider>,
  account: string,
): Promise<Signer> {
  if (network.local) {
    const index = Number(account);
    if (!Number.isInteger(index) || index < 0) throw new ValueStoreError(`--account must be an index, got "${account}".`);
    return provider.getSigner(index);
  }
  const privateKey = (process.env.PRIVATE_KEY ?? "").trim();
  if (privateKey === "") throw new ValueStoreError("PRIVATE_KEY is not set in .env (needed to send transactions).");
  return new Wallet(privateKey, provider);
}
