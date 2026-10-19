// Reads both values (decrypts in private mode).  npm run get -- [--network <name>]
import { createContext, run } from "./lib/cli.js";

await run(async () => {
  const { reader } = await createContext();
  const string = await reader.getString();
  const number = await reader.getNumber();
  console.log(`mode:   ${await reader.getMode()}`);
  console.log(`string: ${string === null ? "(not set)" : JSON.stringify(string)}`);
  console.log(`number: ${number === null ? "(not set)" : number.toString()}`);
});
