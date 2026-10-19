// npm run clear-number -- [--network <name>] [--account N]
import { createContext, printReceipt, run } from "./lib/cli.js";

await run(async () => {
  const ctx = await createContext();
  await printReceipt(ctx, "Number cleared", await (await ctx.writer()).clearNumber());
});
