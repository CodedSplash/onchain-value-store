// npm run set-number -- <non-negative integer> [--network <name>] [--account N]
import { ValueStoreError } from "../client/index.js";
import { createContext, printReceipt, requireArg, run } from "./lib/cli.js";

await run(async () => {
  const ctx = await createContext();
  const raw = requireArg(ctx, 0, "npm run set-number -- <integer>");
  if (!/^[0-9]+$/.test(raw)) throw new ValueStoreError(`Not a non-negative integer: "${raw}"`);
  await printReceipt(ctx, "Number set", await (await ctx.writer()).setNumber(BigInt(raw)));
});
