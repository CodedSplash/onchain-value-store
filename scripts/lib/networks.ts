/** Networks ValueStore may be deployed to. Everything else (mainnet included) is refused. */
export interface AllowedNetwork {
  readonly chainId: bigint;
  readonly label: string;
  /** Block explorer base URL, or null for local networks. */
  readonly explorer: string | null;
  /** Local networks need no confirmations and no verification. */
  readonly local: boolean;
}

export const ALLOWED_NETWORKS: readonly AllowedNetwork[] = [
  { chainId: 11155111n, label: "Sepolia", explorer: "https://sepolia.etherscan.io", local: false },
  { chainId: 560048n, label: "Hoodi", explorer: "https://hoodi.etherscan.io", local: false },
  { chainId: 31337n, label: "Hardhat local", explorer: null, local: true },
];

export class NetworkNotAllowedError extends Error {
  constructor(readonly chainId: bigint) {
    const allowed = ALLOWED_NETWORKS.map((n) => `${n.label} (${n.chainId})`).join(", ");
    const hint = chainId === 1n ? " Ethereum mainnet is forbidden in this project." : "";
    super(`Refusing to run on chainId ${chainId}.${hint} Allowed networks: ${allowed}.`);
    this.name = "NetworkNotAllowedError";
  }
}

/** Returns the whitelist entry for `chainId` or throws `NetworkNotAllowedError`. */
export function assertAllowedNetwork(chainId: bigint): AllowedNetwork {
  const network = ALLOWED_NETWORKS.find((n) => n.chainId === chainId);
  if (!network) throw new NetworkNotAllowedError(chainId);
  return network;
}

/** Explorer link to an address, or null for local networks. */
export function explorerAddressUrl(network: AllowedNetwork, address: string): string | null {
  return network.explorer === null ? null : `${network.explorer}/address/${address}`;
}
