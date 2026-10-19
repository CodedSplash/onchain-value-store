// Deploys ValueStore. Usage:
//   npx hardhat run scripts/deploy.ts --network sepolia
// Parameters come from .env: MODE, INITIAL_OWNER, CONFIRMATIONS, ETHERSCAN_API_KEY.
import hre, { network } from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";

import { deployValueStore } from "./lib/deploy-core.js";
import { MODE_ENUM, parseDeployConfig } from "./lib/deploy-config.js";
import { saveDeployment } from "./lib/deployments.js";
import { assertAllowedNetwork, explorerAddressUrl } from "./lib/networks.js";

async function main(): Promise<void> {
  const config = parseDeployConfig(process.env);
  const { ethers, networkName } = await network.getOrCreate();

  // Check the whitelist before anything else so the error is clear.
  const allowed = assertAllowedNetwork((await ethers.provider.getNetwork()).chainId);
  console.log(`Deploying ValueStore (mode: ${config.mode}) to ${networkName} [${allowed.label}]...`);

  const record = await deployValueStore(ethers, networkName, config);
  const file = saveDeployment(record);

  console.log(`ValueStore deployed at ${record.address}`);
  console.log(`  owner:  ${record.owner}`);
  console.log(`  tx:     ${record.txHash} (block ${record.blockNumber})`);
  console.log(`  saved:  ${file}`);
  const url = explorerAddressUrl(allowed, record.address);
  if (url) console.log(`  explorer: ${url}`);

  const apiKey = (process.env.ETHERSCAN_API_KEY ?? "").trim();
  if (allowed.local) {
    console.log("Local network: skipping Etherscan verification.");
  } else if (apiKey === "") {
    console.log("ETHERSCAN_API_KEY is not set: skipping verification. To verify later:");
    console.log(`  npx hardhat verify --network ${networkName} ${record.address} ${record.owner} ${MODE_ENUM[config.mode]}`);
  } else {
    console.log("Verifying on Etherscan...");
    try {
      await verifyContract(
        { address: record.address, constructorArgs: [record.owner, MODE_ENUM[config.mode]], provider: "etherscan" },
        hre,
      );
      console.log("Verified.");
    } catch (error) {
      // Deployment already succeeded; verification can be retried by hand.
      console.error(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`Retry: npx hardhat verify --network ${networkName} ${record.address} ${record.owner} ${MODE_ENUM[config.mode]}`);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(`Deployment failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
