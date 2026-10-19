import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

// Load .env into process.env (Node >= 20.12 built-in, no dotenv dependency).
// A missing .env is fine: tests and the local network need no secrets.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

// Same compiler settings for every build profile, so the bytecode that is
// deployed (default profile) matches what hardhat-verify recompiles
// (production profile).
const compiler = {
  version: "0.8.37",
  // Optional local solc binary for offline / restricted environments.
  ...(process.env.SOLC_PATH ? { path: process.env.SOLC_PATH } : {}),
  settings: {
    evmVersion: "prague",
    optimizer: { enabled: true, runs: 200 },
  },
};

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: compiler,
      production: compiler,
    },
  },
  networks: {
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
    hoodi: {
      type: "http",
      chainType: "l1",
      url: configVariable("HOODI_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
});
