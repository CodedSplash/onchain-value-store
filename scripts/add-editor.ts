// Owner only.  npm run add-editor -- <address> [--network <name>]
import { createContext, printReceipt, requireArg, run } from "./lib/cli.js";

await run(async () => {
  const ctx = await createContext();
  const account = requireArg(ctx, 0, "npm run add-editor -- <address>");
  await printReceipt(ctx, `Editor ${account} added`, await (await ctx.writer()).addEditor(account));
});
