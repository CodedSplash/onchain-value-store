import { expect } from "chai";
import { Contract, getBytes } from "ethers";

import {
  ContractRevertError,
  DecryptionError,
  InvalidKeyError,
  InvalidValueError,
  KeyRequired,
  ValueStoreError,
  ValueStoreReader,
  ValueStoreWriter,
  encryptString,
  generateKey,
  keyToHex,
} from "../../client/index.js";
import { Mode, ethers } from "../helpers/fixtures.js";

const MAX_UINT256 = 2n ** 256n - 1n;

async function setup(mode: bigint) {
  const [owner, editor, stranger] = await ethers.getSigners();
  const store = await ethers.deployContract("ValueStore", [owner!.address, mode]);
  const address = await store.getAddress();
  const key = generateKey();
  const provider = ethers.provider;
  return {
    address,
    key,
    owner: owner!,
    editor: editor!,
    stranger: stranger!,
    reader: ValueStoreReader.connect({ provider, address, key }),
    writer: ValueStoreWriter.connect({ provider, address, signer: owner!, key }),
  };
}

async function expectRejects<E extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => E): Promise<E> {
  try {
    await promise;
  } catch (error) {
    expect(error).to.be.instanceOf(type);
    return error as E;
  }
  return expect.fail(`expected ${type.name}`);
}

describe("client: connect", function () {
  it("requires rpcUrl or provider", function () {
    expect(() => ValueStoreReader.connect({ address: ethers.ZeroAddress })).to.throw(ValueStoreError, /rpcUrl/);
  });

  it("rejects an invalid address", function () {
    expect(() => ValueStoreReader.connect({ provider: ethers.provider, address: "0x123" })).to.throw(
      ValueStoreError,
      /Invalid contract address/,
    );
  });

  it("rejects a malformed key early", function () {
    expect(() => ValueStoreReader.connect({ provider: ethers.provider, address: ethers.ZeroAddress, key: "abc" })).to.throw(
      InvalidKeyError,
    );
  });

  it("explains when the address is not a ValueStore", async function () {
    const reader = ValueStoreReader.connect({ provider: ethers.provider, address: ethers.Wallet.createRandom().address });
    const error = await expectRejects(reader.getMode(), ValueStoreError);
    expect(error.message).to.match(/Is this a ValueStore contract/);
  });
});

describe("client: public mode", function () {
  it("detects the mode automatically", async function () {
    const { reader } = await setup(Mode.Public);
    expect(await reader.getMode()).to.equal("public");
  });

  it("returns null for unset values and false for has*", async function () {
    const { reader } = await setup(Mode.Public);
    expect(await reader.hasString()).to.equal(false);
    expect(await reader.hasNumber()).to.equal(false);
    expect(await reader.getString()).to.equal(null);
    expect(await reader.getNumber()).to.equal(null);
    expect(await reader.getRevision()).to.equal(0n);
  });

  it("works without a key and ignores a given key", async function () {
    const { address, owner } = await setup(Mode.Public);
    const writer = ValueStoreWriter.connect({ provider: ethers.provider, address, signer: owner });
    await writer.setString("plain");
    const reader = ValueStoreReader.connect({ provider: ethers.provider, address });
    expect(await reader.getString()).to.equal("plain");
  });

  it("round-trips string (unicode, emoji) and number (0, 2^256 - 1) as bigint", async function () {
    const { reader, writer } = await setup(Mode.Public);
    const text = "Привет 👋🏽 emoji 🚀";
    await writer.setString(text);
    expect(await reader.getString()).to.equal(text);
    for (const value of [0n, 42n, MAX_UINT256]) {
      await writer.setNumber(value);
      const read = await reader.getNumber();
      expect(typeof read).to.equal("bigint");
      expect(read).to.equal(value);
    }
    expect(await reader.getRevision()).to.equal(4n);
  });

  it("clears values back to null", async function () {
    const { reader, writer } = await setup(Mode.Public);
    await writer.setString("x");
    await writer.setNumber(0n);
    await writer.clearString();
    await writer.clearNumber();
    expect(await reader.getString()).to.equal(null);
    expect(await reader.getNumber()).to.equal(null);
  });

  it("validates values before sending", async function () {
    const { writer } = await setup(Mode.Public);
    await expectRejects(writer.setString(""), InvalidValueError);
    await expectRejects(writer.setString("a".repeat(1025)), InvalidValueError);
    await expectRejects(writer.setNumber(-1n), InvalidValueError);
    await expectRejects(writer.setNumber(MAX_UINT256 + 1n), InvalidValueError);
    await expectRejects(writer.addEditor("not-an-address"), InvalidValueError);
  });

  it("returns the mined receipt", async function () {
    const { writer, address } = await setup(Mode.Public);
    const receipt = await writer.setNumber(1n);
    expect(receipt.status).to.equal(1);
    expect(receipt.to).to.equal(address);
  });
});

describe("client: private mode", function () {
  it("detects the mode automatically", async function () {
    const { reader } = await setup(Mode.Private);
    expect(await reader.getMode()).to.equal("private");
  });

  it("round-trips encrypted string and number; on-chain data is ciphertext", async function () {
    const { reader, writer, address } = await setup(Mode.Private);
    const text = "секрет 🔐 漢字";
    await writer.setString(text);
    await writer.setNumber(MAX_UINT256);
    expect(await reader.getString()).to.equal(text);
    expect(await reader.getNumber()).to.equal(MAX_UINT256);
    await writer.setNumber(0n);
    expect(await reader.getNumber()).to.equal(0n);

    const raw = await ethers.getContractAt("ValueStore", address);
    const onChain = getBytes(await raw.getEncryptedString());
    expect(onChain[0]).to.equal(0x01);
    expect(Buffer.from(onChain).toString("utf8")).to.not.include("секрет");
  });

  it("accepts the key as hex string", async function () {
    const { address, key, writer } = await setup(Mode.Private);
    await writer.setString("hex key");
    const reader = ValueStoreReader.connect({ provider: ethers.provider, address, key: `0x${keyToHex(key)}` });
    expect(await reader.getString()).to.equal("hex key");
  });

  it("returns null for unset values", async function () {
    const { reader } = await setup(Mode.Private);
    expect(await reader.getString()).to.equal(null);
    expect(await reader.getNumber()).to.equal(null);
  });

  it("KeyRequired when reading or writing values without a key", async function () {
    const { address, owner, writer } = await setup(Mode.Private);
    await writer.setString("x");
    const reader = ValueStoreReader.connect({ provider: ethers.provider, address });
    await expectRejects(reader.getString(), KeyRequired);
    await expectRejects(reader.getNumber(), KeyRequired);
    const keyless = ValueStoreWriter.connect({ provider: ethers.provider, address, signer: owner });
    await expectRejects(keyless.setString("y"), KeyRequired);
    await expectRejects(keyless.setNumber(1n), KeyRequired);
  });

  it("metadata stays readable without a key", async function () {
    const { address, writer, owner } = await setup(Mode.Private);
    await writer.setString("x");
    const reader = ValueStoreReader.connect({ provider: ethers.provider, address });
    expect(await reader.hasString()).to.equal(true);
    expect(await reader.getRevision()).to.equal(1n);
    expect(await reader.getOwner()).to.equal(owner.address);
  });

  it("DecryptionError with a wrong key", async function () {
    const { address, writer } = await setup(Mode.Private);
    await writer.setString("x");
    await writer.setNumber(1n);
    const wrong = ValueStoreReader.connect({ provider: ethers.provider, address, key: generateKey() });
    await expectRejects(wrong.getString(), DecryptionError);
    await expectRejects(wrong.getNumber(), DecryptionError);
  });

  it("DecryptionError for ciphertext copied from another contract", async function () {
    const a = await setup(Mode.Private);
    await a.writer.setString("belongs to A");
    const ciphertext = await (await ethers.getContractAt("ValueStore", a.address)).getEncryptedString();

    const [owner] = await ethers.getSigners();
    const b = await ethers.deployContract("ValueStore", [owner!.address, Mode.Private]);
    await b.setEncryptedString(ciphertext);
    const readerB = ValueStoreReader.connect({ provider: ethers.provider, address: await b.getAddress(), key: a.key });
    await expectRejects(readerB.getString(), DecryptionError);
  });

  it("DecryptionError for a string ciphertext placed into the number slot", async function () {
    const { address, key, reader } = await setup(Mode.Private);
    const raw = await ethers.getContractAt("ValueStore", address);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    await raw.setEncryptedNumber(encryptString("123", key, { chainId, address }));
    await expectRejects(reader.getNumber(), DecryptionError);
  });

  it("rejects strings whose ciphertext would exceed 2048 bytes", async function () {
    const { writer } = await setup(Mode.Private);
    await writer.setString("a".repeat(2019)); // 2019 + 29 bytes overhead = 2048
    await expectRejects(writer.setString("a".repeat(2020)), InvalidValueError);
  });
});

describe("client: editors and permissions", function () {
  it("adds and removes editors; editor writes; removed editor gets NotAuthorized", async function () {
    const { address, key, writer, reader, editor } = await setup(Mode.Private);
    await writer.addEditor(editor.address);
    expect(await reader.getEditors()).to.deep.equal([editor.address]);
    expect(await reader.canEdit(editor.address)).to.equal(true);

    const editorWriter = ValueStoreWriter.connect({ provider: ethers.provider, address, signer: editor, key });
    await editorWriter.setString("from editor");
    expect(await reader.getString()).to.equal("from editor");

    await writer.removeEditor(editor.address);
    expect(await reader.getEditors()).to.deep.equal([]);
    const error = await expectRejects(editorWriter.setString("again"), ContractRevertError);
    expect(error.errorName).to.equal("NotAuthorized");
    expect(error.errorArgs).to.deep.equal([editor.address]);
  });

  it("maps contract errors to ContractRevertError", async function () {
    const { address, writer, stranger, editor } = await setup(Mode.Public);
    const strangerWriter = ValueStoreWriter.connect({ provider: ethers.provider, address, signer: stranger });
    expect((await expectRejects(strangerWriter.setNumber(1n), ContractRevertError)).errorName).to.equal("NotAuthorized");
    expect((await expectRejects(writer.removeEditor(editor.address), ContractRevertError)).errorName).to.equal(
      "NotEditor",
    );
    expect((await expectRejects(writer.addEditor(ethers.ZeroAddress), ContractRevertError)).errorName).to.equal(
      "ZeroAddress",
    );
    await writer.addEditor(editor.address);
    expect((await expectRejects(writer.addEditor(editor.address), ContractRevertError)).errorName).to.equal(
      "AlreadyEditor",
    );
  });

  it("uses only the standalone ABI (no Hardhat artifacts)", async function () {
    const { address } = await setup(Mode.Public);
    const { VALUE_STORE_ABI } = await import("../../client/abi.js");
    const contract = new Contract(address, VALUE_STORE_ABI, ethers.provider);
    expect(await contract.getFunction("mode").staticCall()).to.equal(0n);
  });
});
