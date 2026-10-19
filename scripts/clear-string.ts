// npm run clear-string -- [--network <name>] [--account N]
import { createContext, printReceipt, run } from "./lib/cli.js";

await run(async () => {
  const ctx = await createContext();
  await printReceipt(ctx, "String cleared", await (await ctx.writer()).clearString());
});
