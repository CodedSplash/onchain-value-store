// End-to-end: a real HTTP JSON-RPC Hardhat node, contract deployed with a plain
// ethers Wallet, then written and read only through the client and `rpcUrl`.
import { expect } from "chai";
import hre from "hardhat";
import { ContractFactory, HDNodeWallet, JsonRpcProvider, Mnemonic, type Signer } from "ethers";
import type { JsonRpcServer } from "hardhat/types/network";

import { KeyRequired, ValueStoreReader, ValueStoreWriter, generateKey } from "../../client/index.js";
import { Mode } from "../helpers/fixtures.js";

// Hardhat's well-known default development mnemonic (test funds only).
const DEV_MNEMONIC = "test test test test test test test test test test test junk";

function devWallet(index: number, provider: JsonRpcProvider): Signer {
  return HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(DEV_MNEMONIC), `m/44'/60'/0'/0/${index}`).connect(provider);
}

describe("e2e: local Hardhat JSON-RPC node", function () {
  this.timeout(60_000);

  let server: JsonRpcServer;
  let rpcUrl: string;
  let provider: JsonRpcProvider;

  before(async function () {
    server = await hre.network.createServer("default", "127.0.0.1", 0);
    const { address, port } = await server.listen();
    rpcUrl = `http://${address}:${port}`;
    provider = new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
  });

  after(async function () {
    provider.destroy();
    await server.close();
  });

  async function deploy(mode: bigint): Promise<string> {
    const artifact = await hre.artifacts.readArtifact("ValueStore");
    const owner = devWallet(0, provider);
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, owner);
    const contract = await factory.deploy(await owner.getAddress(), mode);
    await contract.waitForDeployment();
    return contract.getAddress();
  }

  it("public mode: deploy, write, read with rpcUrl only, manage editors", async function () {
    const address = await deploy(Mode.Public);
    const owner = devWallet(0, provider);
    const editor = devWallet(1, provider);
    const editorAddress = await editor.getAddress();

    const writer = ValueStoreWriter.connect({ rpcUrl, address, signer: owner });
    await writer.setString("hello from e2e 👋");
    await writer.setNumber(2n ** 256n - 1n);

    const reader = ValueStoreReader.connect({ rpcUrl, address });
    expect(await reader.getMode()).to.equal("public");
    expect(await reader.getString()).to.equal("hello from e2e 👋");
    expect(await reader.getNumber()).to.equal(2n ** 256n - 1n);
    expect(await reader.getRevision()).to.equal(2n);

    await writer.addEditor(editorAddress);
    expect(await reader.getEditors()).to.deep.equal([editorAddress]);
    await ValueStoreWriter.connect({ rpcUrl, address, signer: editor }).setNumber(0n);
    expect(await reader.getNumber()).to.equal(0n);
    await writer.removeEditor(editorAddress);
    expect(await reader.canEdit(editorAddress)).to.equal(false);

    await writer.clearString();
    expect(await reader.getString()).to.equal(null);
  });

  it("private mode: deploy, encrypted write, decrypt with key, KeyRequired without", async function () {
    const address = await deploy(Mode.Private);
    const key = generateKey();
    // A bare wallet without provider: the writer connects it to rpcUrl.
    const ownerNoProvider = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(DEV_MNEMONIC), "m/44'/60'/0'/0/0");

    const writer = ValueStoreWriter.connect({ rpcUrl, address, signer: ownerNoProvider, key });
    await writer.setString("секретное значение");
    await writer.setNumber(42n);

    const reader = ValueStoreReader.connect({ rpcUrl, address, key });
    expect(await reader.getMode()).to.equal("private");
    expect(await reader.getString()).to.equal("секретное значение");
    expect(await reader.getNumber()).to.equal(42n);

    // Immediate read after write must not be stale (ethers' default 250 ms cache).
    const cachedReader = ValueStoreReader.connect({ rpcUrl, address, key });
    expect(await cachedReader.getNumber()).to.equal(42n);
    await writer.setNumber(43n);
    expect(await cachedReader.getNumber()).to.equal(43n);

    const keyless = ValueStoreReader.connect({ rpcUrl, address });
    expect(await keyless.hasString()).to.equal(true);
    try {
      await keyless.getString();
      expect.fail("expected KeyRequired");
    } catch (error) {
      expect(error).to.be.instanceOf(KeyRequired);
    }
  });
});
