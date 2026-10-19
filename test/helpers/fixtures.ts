import { network } from "hardhat";

/** Contract enum `ValueStore.Mode`. */
export const Mode = { Public: 0n, Private: 1n } as const;

/** One in-process Hardhat network shared by every contract test file. */
export const connection = await network.create();
export const { ethers, networkHelpers } = connection;

async function deploy(mode: bigint) {
  const [owner, editor, stranger, other] = await ethers.getSigners();
  if (!owner || !editor || !stranger || !other) throw new Error("not enough signers");
  const store = await ethers.deployContract("ValueStore", [owner.address, mode]);
  return { store, owner, editor, stranger, other };
}

/** Fresh Public-mode store with `editor` already added. */
export async function publicFixture() {
  const ctx = await deploy(Mode.Public);
  await ctx.store.addEditor(ctx.editor.address);
  return ctx;
}

/** Fresh Private-mode store with `editor` already added. */
export async function privateFixture() {
  const ctx = await deploy(Mode.Private);
  await ctx.store.addEditor(ctx.editor.address);
  return ctx;
}

/** `n` bytes of non-empty test data as a 0x hex string. */
export function bytesOf(n: number): string {
  return ethers.hexlify(new Uint8Array(n).fill(0xab));
}
