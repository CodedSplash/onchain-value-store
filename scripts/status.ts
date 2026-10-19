// Prints mode, owner, editors, has* flags and revision.  npm run status -- [--network <name>]
import { createContext, run } from "./lib/cli.js";
import { explorerAddressUrl } from "./lib/networks.js";

await run(async () => {
  const ctx = await createContext();
  const { reader, deployment } = ctx;
  const [mode, owner, editors, hasString, hasNumber, revision] = await Promise.all([
    reader.getMode(),
    reader.getOwner(),
    reader.getEditors(),
    reader.hasString(),
    reader.hasNumber(),
    reader.getRevision(),
  ]);
  console.log(`network:   ${ctx.networkName} (${ctx.network.label}, chainId ${deployment.chainId})`);
  console.log(`address:   ${deployment.address}`);
  const url = explorerAddressUrl(ctx.network, deployment.address);
  if (url) console.log(`explorer:  ${url}`);
  console.log(`mode:      ${mode}`);
  console.log(`owner:     ${owner}`);
  console.log(`editors:   ${editors.length === 0 ? "(none)" : editors.join(", ")}`);
  console.log(`hasString: ${hasString}`);
  console.log(`hasNumber: ${hasNumber}`);
  console.log(`revision:  ${revision}`);
  if (mode === "private") console.log(`key:       ${ctx.key ? "configured" : "NOT configured (set VALUESTORE_KEY)"}`);
});
