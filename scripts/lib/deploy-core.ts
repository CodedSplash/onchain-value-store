import type { HardhatEthers } from "@nomicfoundation/hardhat-ethers/types";

import { MODE_ENUM, type DeployConfig } from "./deploy-config.js";
import type { DeploymentRecord } from "./deployments.js";
import { assertAllowedNetwork } from "./networks.js";

/**
 * Deploys ValueStore and returns the deployment record. Checks the chainId
 * whitelist before sending anything. Local networks wait for 1 confirmation.
 */
export async function deployValueStore(
  ethers: HardhatEthers,
  networkName: string,
  config: DeployConfig,
): Promise<DeploymentRecord> {
  const { chainId } = await ethers.provider.getNetwork();
  const allowed = assertAllowedNetwork(chainId);

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error(`No deployer account configured for network "${networkName}" (set PRIVATE_KEY).`);

  const owner = config.initialOwner ?? deployer.address;
  const store = await ethers.deployContract("ValueStore", [owner, MODE_ENUM[config.mode]]);
  const tx = store.deploymentTransaction();
  if (!tx) throw new Error("Deployment transaction is missing");

  const receipt = await tx.wait(allowed.local ? 1 : config.confirmations);
  if (!receipt) throw new Error("Deployment transaction was not mined");

  const block = await ethers.provider.getBlock(receipt.blockNumber);
  return {
    network: networkName,
    chainId: chainId.toString(),
    address: await store.getAddress(),
    mode: config.mode,
    owner: ethers.getAddress(owner),
    deployer: deployer.address,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    timestamp: new Date(Number(block?.timestamp ?? 0) * 1000).toISOString(),
  };
}
