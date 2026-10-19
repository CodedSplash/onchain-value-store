// Minimal app that reads a ValueStore. Needs no wallet, no gas, no deployments/ file:
// only an RPC URL and the contract address (plus VALUESTORE_KEY for a private-mode store).
//
//   npm run example:read -- <rpcUrl> <contractAddress>
//   VALUESTORE_KEY=<hex> npm run example:read -- <rpcUrl> <contractAddress>
import { ValueStoreReader } from "../client/index.js";

const [rpcUrl, address] = process.argv.slice(2);
if (!rpcUrl || !address) {
  console.error("Usage: npm run example:read -- <rpcUrl> <contractAddress>");
  process.exit(1);
}

const key = process.env.VALUESTORE_KEY?.trim() || undefined;
const reader = ValueStoreReader.connect({ rpcUrl, address, key });

try {
  console.log("mode:    ", await reader.getMode());
  console.log("string:  ", await reader.getString()); // string | null
  console.log("number:  ", String(await reader.getNumber())); // bigint | null
  console.log("revision:", String(await reader.getRevision()));
} catch (error) {
  // KeyRequired, DecryptionError, network errors...
  console.error(`${(error as Error).name}: ${(error as Error).message}`);
  process.exitCode = 1;
}
