import { isAddress } from "ethers";

export type ModeName = "public" | "private";

/** Values of the contract's `ValueStore.Mode` enum. */
export const MODE_ENUM: Record<ModeName, bigint> = { public: 0n, private: 1n };

export interface DeployConfig {
  readonly mode: ModeName;
  /** Explicit owner, or null to use the deployer address. */
  readonly initialOwner: string | null;
  readonly confirmations: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const DEFAULT_CONFIRMATIONS = 2;

/** Parses deployment parameters (MODE, INITIAL_OWNER, CONFIRMATIONS) from an env map. */
export function parseDeployConfig(env: NodeJS.ProcessEnv): DeployConfig {
  const rawMode = (env.MODE ?? "").trim().toLowerCase();
  if (rawMode !== "public" && rawMode !== "private") {
    throw new ConfigError(`MODE must be "public" or "private", got "${env.MODE ?? ""}".`);
  }

  const rawOwner = (env.INITIAL_OWNER ?? "").trim();
  if (rawOwner !== "" && !isAddress(rawOwner)) {
    throw new ConfigError(`INITIAL_OWNER is not a valid address: "${rawOwner}".`);
  }

  const rawConfirmations = (env.CONFIRMATIONS ?? "").trim();
  const confirmations = rawConfirmations === "" ? DEFAULT_CONFIRMATIONS : Number(rawConfirmations);
  if (!Number.isInteger(confirmations) || confirmations < 1) {
    throw new ConfigError(`CONFIRMATIONS must be a positive integer, got "${rawConfirmations}".`);
  }

  return { mode: rawMode, initialOwner: rawOwner === "" ? null : rawOwner, confirmations };
}
