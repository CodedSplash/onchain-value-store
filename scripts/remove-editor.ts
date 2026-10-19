// Owner only.  npm run remove-editor -- <address> [--network <name>]
import { createContext, printReceipt, requireArg, run } from "./lib/cli.js";

await run(async () => {
  const ctx = await createContext();
  const account = requireArg(ctx, 0, "npm run remove-editor -- <address>");
  await printReceipt(ctx, `Editor ${account} removed`, await (await ctx.writer()).removeEditor(account));
});
