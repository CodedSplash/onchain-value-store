// Generates a new AES-256-GCM key for private mode.
//   npm run keygen                       print the key
//   npm run keygen -- --out ~/vs.key     also write it to a new file (mode 0600)
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { generateKey, keyToHex } from "../client/index.js";

const { values } = parseArgs({ options: { out: { type: "string" } } });
const hex = keyToHex(generateKey());

if (values.out) {
  try {
    // "wx": never overwrite an existing key file.
    writeFileSync(values.out, hex + "\n", { mode: 0o600, flag: "wx" });
  } catch (error) {
    const exists = (error as NodeJS.ErrnoException).code === "EEXIST";
    console.error(exists ? `Refusing to overwrite existing file ${values.out}.` : String(error));
    process.exit(1);
  }
  console.log(`Key written to ${values.out}. Point VALUESTORE_KEY_FILE at it, keep it outside the repository.`);
} else {
  console.log(`VALUESTORE_KEY=${hex}`);
}
console.log("Keep this key secret and backed up: without it private-mode values cannot be decrypted.");
console.log("Share it off-chain only with the people who must read or write the values.");
