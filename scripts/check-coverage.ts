// Fails (exit 1) if Solidity line coverage in coverage/lcov.info is below the threshold.
// Hardhat 3's built-in coverage reports lines/statements; see docs/DECISIONS.md.
import { readFileSync } from "node:fs";

const THRESHOLD = 95;
const lcov = readFileSync("coverage/lcov.info", "utf8");

let found = 0;
let hit = 0;
for (const line of lcov.split("\n")) {
  if (line.startsWith("LF:")) found += Number(line.slice(3));
  if (line.startsWith("LH:")) hit += Number(line.slice(3));
}

const percent = found === 0 ? 0 : (hit / found) * 100;
console.log(`Solidity line coverage: ${percent.toFixed(2)}% (${hit}/${found}), threshold ${THRESHOLD}%`);
if (percent < THRESHOLD) process.exit(1);
