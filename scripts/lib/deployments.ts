import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ModeName } from "./deploy-config.js";

/** Contents of `deployments/<network>.json`. */
export interface DeploymentRecord {
  readonly network: string;
  readonly chainId: string;
  readonly address: string;
  readonly mode: ModeName;
  readonly owner: string;
  readonly deployer: string;
  readonly txHash: string;
  readonly blockNumber: number;
  readonly timestamp: string;
}

export const DEFAULT_DEPLOYMENTS_DIR = path.resolve(import.meta.dirname, "..", "..", "deployments");

export function deploymentPath(network: string, dir = DEFAULT_DEPLOYMENTS_DIR): string {
  if (!/^[A-Za-z0-9_-]+$/.test(network)) throw new Error(`Invalid network name: "${network}"`);
  return path.join(dir, `${network}.json`);
}

export function saveDeployment(record: DeploymentRecord, dir = DEFAULT_DEPLOYMENTS_DIR): string {
  mkdirSync(dir, { recursive: true });
  const file = deploymentPath(record.network, dir);
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  return file;
}

export function loadDeployment(network: string, dir = DEFAULT_DEPLOYMENTS_DIR): DeploymentRecord {
  const file = deploymentPath(network, dir);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error(`No deployment found for "${network}" (${file}). Deploy first: npx hardhat run scripts/deploy.ts --network ${network}`);
  }
  return JSON.parse(raw) as DeploymentRecord;
}
