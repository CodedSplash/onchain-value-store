// npm run set-string -- "<value>" [--network <name>] [--account N]
import { createContext, printReceipt, requireArg, run } from "./lib/cli.js";

await run(async () => {
  const ctx = await createContext();
  const value = requireArg(ctx, 0, 'npm run set-string -- "<value>"');
  await printReceipt(ctx, "String set", await (await ctx.writer()).setString(value));
});
