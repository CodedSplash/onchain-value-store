import { expect } from "chai";

import {
  Mode,
  bytesOf,
  ethers,
  networkHelpers,
  privateFixture,
  publicFixture,
} from "../helpers/fixtures.js";

const { loadFixture } = networkHelpers;

describe("ValueStore: deployment", function () {
  for (const [name, fixture, mode] of [
    ["Public", publicFixture, Mode.Public],
    ["Private", privateFixture, Mode.Private],
  ] as const) {
    it(`${name}: sets mode, owner and empty initial state`, async function () {
      const { store, owner } = await loadFixture(fixture);
      expect(await store.mode()).to.equal(mode);
      expect(await store.owner()).to.equal(owner.address);
      expect(await store.hasString()).to.equal(false);
      expect(await store.hasNumber()).to.equal(false);
      expect(await store.revision()).to.equal(0n);
    });
  }

  it("exposes the limits as constants", async function () {
    const { store } = await loadFixture(publicFixture);
    expect(await store.MAX_STRING_BYTES()).to.equal(1024n);
    expect(await store.MAX_CIPHERTEXT_BYTES()).to.equal(2048n);
    expect(await store.MAX_EDITORS()).to.equal(32n);
  });

  it("rejects the zero address as initial owner", async function () {
    const factory = await ethers.getContractFactory("ValueStore");
    await expect(
      factory.deploy(ethers.ZeroAddress, Mode.Public),
    ).to.be.revertedWithCustomError(factory, "ZeroAddress");
  });

  it("can be deployed for an owner other than the deployer", async function () {
    const [, , , other] = await ethers.getSigners();
    const store = await ethers.deployContract("ValueStore", [other!.address, Mode.Private]);
    expect(await store.owner()).to.equal(other!.address);
  });

  it("rejects plain ETH transfers", async function () {
    const { store, owner } = await loadFixture(publicFixture);
    await expect(
      owner.sendTransaction({ to: await store.getAddress(), value: 1n }),
    ).to.revert(ethers);
  });

  it("rejects ETH sent with unknown calldata (no fallback)", async function () {
    const { store, owner } = await loadFixture(publicFixture);
    await expect(
      owner.sendTransaction({ to: await store.getAddress(), value: 1n, data: "0x12345678" }),
    ).to.revert(ethers);
  });
});

describe("ValueStore: Public mode values", function () {
  it("getters return empty values when nothing is set", async function () {
    const { store } = await loadFixture(publicFixture);
    expect(await store.getString()).to.equal("");
    expect(await store.getNumber()).to.equal(0n);
  });

  it("owner sets string and number", async function () {
    const { store, owner } = await loadFixture(publicFixture);
    await expect(store.setString("hello"))
      .to.emit(store, "StringUpdated")
      .withArgs(owner.address, 1n);
    await expect(store.setNumber(42n))
      .to.emit(store, "NumberUpdated")
      .withArgs(owner.address, 2n);
    expect(await store.getString()).to.equal("hello");
    expect(await store.getNumber()).to.equal(42n);
    expect(await store.hasString()).to.equal(true);
    expect(await store.hasNumber()).to.equal(true);
  });

  it("editor sets string and number", async function () {
    const { store, editor } = await loadFixture(publicFixture);
    await expect(store.connect(editor).setString("by editor"))
      .to.emit(store, "StringUpdated")
      .withArgs(editor.address, 1n);
    await expect(store.connect(editor).setNumber(7n))
      .to.emit(store, "NumberUpdated")
      .withArgs(editor.address, 2n);
    expect(await store.getString()).to.equal("by editor");
    expect(await store.getNumber()).to.equal(7n);
  });

  it("stranger cannot write: NotAuthorized", async function () {
    const { store, stranger } = await loadFixture(publicFixture);
    const s = store.connect(stranger);
    const calls = [() => s.setString("x"), () => s.setNumber(1n), () => s.clearString(), () => s.clearNumber()];
    for (const call of calls) {
      await expect(call()).to.be.revertedWithCustomError(store, "NotAuthorized").withArgs(stranger.address);
    }
  });

  it("setNumber(0) works and hasNumber becomes true", async function () {
    const { store } = await loadFixture(publicFixture);
    await store.setNumber(0n);
    expect(await store.hasNumber()).to.equal(true);
    expect(await store.getNumber()).to.equal(0n);
  });

  it("setNumber accepts 2^256 - 1", async function () {
    const { store } = await loadFixture(publicFixture);
    await store.setNumber(ethers.MaxUint256);
    expect(await store.getNumber()).to.equal(ethers.MaxUint256);
  });

  it("stores unicode and emoji as UTF-8", async function () {
    const { store } = await loadFixture(publicFixture);
    const value = "Привет, мир 👋🏽 漢字";
    await store.setString(value);
    expect(await store.getString()).to.equal(value);
  });

  it("empty string: EmptyValue", async function () {
    const { store } = await loadFixture(publicFixture);
    await expect(store.setString("")).to.be.revertedWithCustomError(store, "EmptyValue");
  });

  it("string of 1024 bytes passes, 1025 bytes fails with ValueTooLong", async function () {
    const { store } = await loadFixture(publicFixture);
    await store.setString("a".repeat(1024));
    expect(await store.getString()).to.have.length(1024);
    await expect(store.setString("a".repeat(1025)))
      .to.be.revertedWithCustomError(store, "ValueTooLong")
      .withArgs(1024n, 1025n);
  });

  it("string length limit counts bytes, not characters", async function () {
    const { store } = await loadFixture(publicFixture);
    // "ж" is 2 bytes in UTF-8: 513 characters = 1026 bytes.
    await expect(store.setString("ж".repeat(513)))
      .to.be.revertedWithCustomError(store, "ValueTooLong")
      .withArgs(1024n, 1026n);
  });

  it("clearString / clearNumber reset flag and value", async function () {
    const { store, owner } = await loadFixture(publicFixture);
    await store.setString("x");
    await store.setNumber(5n);
    await expect(store.clearString()).to.emit(store, "StringCleared").withArgs(owner.address, 3n);
    await expect(store.clearNumber()).to.emit(store, "NumberCleared").withArgs(owner.address, 4n);
    expect(await store.hasString()).to.equal(false);
    expect(await store.hasNumber()).to.equal(false);
    expect(await store.getString()).to.equal("");
    expect(await store.getNumber()).to.equal(0n);
  });

  it("editor can clear values", async function () {
    const { store, editor } = await loadFixture(publicFixture);
    await store.setString("x");
    await expect(store.connect(editor).clearString())
      .to.emit(store, "StringCleared")
      .withArgs(editor.address, 2n);
  });

  it("revision grows on every change and clear", async function () {
    const { store } = await loadFixture(publicFixture);
    await store.setString("a");
    await store.setString("b");
    await store.setNumber(1n);
    await store.clearString();
    await store.clearNumber();
    await store.clearNumber(); // clearing an unset value still counts
    expect(await store.revision()).to.equal(6n);
  });

  it("Private-mode functions fail with WrongMode", async function () {
    const { store } = await loadFixture(publicFixture);
    await expect(store.setEncryptedString("0x01")).to.be.revertedWithCustomError(store, "WrongMode");
    await expect(store.setEncryptedNumber("0x01")).to.be.revertedWithCustomError(store, "WrongMode");
    await expect(store.getEncryptedString()).to.be.revertedWithCustomError(store, "WrongMode");
    await expect(store.getEncryptedNumber()).to.be.revertedWithCustomError(store, "WrongMode");
  });

  it("checks permissions before mode (stranger gets NotAuthorized)", async function () {
    const { store, stranger } = await loadFixture(publicFixture);
    await expect(store.connect(stranger).setEncryptedString("0x01"))
      .to.be.revertedWithCustomError(store, "NotAuthorized")
      .withArgs(stranger.address);
  });
});

describe("ValueStore: Private mode values", function () {
  it("getters return empty bytes when nothing is set", async function () {
    const { store } = await loadFixture(privateFixture);
    expect(await store.getEncryptedString()).to.equal("0x");
    expect(await store.getEncryptedNumber()).to.equal("0x");
  });

  it("owner sets encrypted string and number", async function () {
    const { store, owner } = await loadFixture(privateFixture);
    await expect(store.setEncryptedString("0x0102"))
      .to.emit(store, "StringUpdated")
      .withArgs(owner.address, 1n);
    await expect(store.setEncryptedNumber("0x0304"))
      .to.emit(store, "NumberUpdated")
      .withArgs(owner.address, 2n);
    expect(await store.getEncryptedString()).to.equal("0x0102");
    expect(await store.getEncryptedNumber()).to.equal("0x0304");
    expect(await store.hasString()).to.equal(true);
    expect(await store.hasNumber()).to.equal(true);
  });

  it("editor sets encrypted values", async function () {
    const { store, editor } = await loadFixture(privateFixture);
    await expect(store.connect(editor).setEncryptedString("0xaa"))
      .to.emit(store, "StringUpdated")
      .withArgs(editor.address, 1n);
    await expect(store.connect(editor).setEncryptedNumber("0xbb"))
      .to.emit(store, "NumberUpdated")
      .withArgs(editor.address, 2n);
  });

  it("stranger cannot write: NotAuthorized", async function () {
    const { store, stranger } = await loadFixture(privateFixture);
    const s = store.connect(stranger);
    const calls = [
      () => s.setEncryptedString("0x01"),
      () => s.setEncryptedNumber("0x01"),
      () => s.clearString(),
      () => s.clearNumber(),
    ];
    for (const call of calls) {
      await expect(call()).to.be.revertedWithCustomError(store, "NotAuthorized").withArgs(stranger.address);
    }
  });

  it("empty ciphertext: EmptyValue", async function () {
    const { store } = await loadFixture(privateFixture);
    await expect(store.setEncryptedString("0x")).to.be.revertedWithCustomError(store, "EmptyValue");
    await expect(store.setEncryptedNumber("0x")).to.be.revertedWithCustomError(store, "EmptyValue");
  });

  it("ciphertext of 2048 bytes passes, 2049 bytes fails with ValueTooLong", async function () {
    const { store } = await loadFixture(privateFixture);
    await store.setEncryptedString(bytesOf(2048));
    await store.setEncryptedNumber(bytesOf(2048));
    expect(await store.getEncryptedString()).to.equal(bytesOf(2048));
    await expect(store.setEncryptedString(bytesOf(2049)))
      .to.be.revertedWithCustomError(store, "ValueTooLong")
      .withArgs(2048n, 2049n);
    await expect(store.setEncryptedNumber(bytesOf(2049)))
      .to.be.revertedWithCustomError(store, "ValueTooLong")
      .withArgs(2048n, 2049n);
  });

  it("clearString / clearNumber reset flag and value", async function () {
    const { store, owner } = await loadFixture(privateFixture);
    await store.setEncryptedString("0x01");
    await store.setEncryptedNumber("0x02");
    await expect(store.clearString()).to.emit(store, "StringCleared").withArgs(owner.address, 3n);
    await expect(store.clearNumber()).to.emit(store, "NumberCleared").withArgs(owner.address, 4n);
    expect(await store.hasString()).to.equal(false);
    expect(await store.hasNumber()).to.equal(false);
    expect(await store.getEncryptedString()).to.equal("0x");
    expect(await store.getEncryptedNumber()).to.equal("0x");
  });

  it("revision grows on every change and clear", async function () {
    const { store } = await loadFixture(privateFixture);
    await store.setEncryptedString("0x01");
    await store.setEncryptedNumber("0x02");
    await store.clearString();
    await store.clearNumber();
    expect(await store.revision()).to.equal(4n);
  });

  it("Public-mode functions fail with WrongMode", async function () {
    const { store } = await loadFixture(privateFixture);
    await expect(store.setString("x")).to.be.revertedWithCustomError(store, "WrongMode");
    await expect(store.setNumber(1n)).to.be.revertedWithCustomError(store, "WrongMode");
    await expect(store.getString()).to.be.revertedWithCustomError(store, "WrongMode");
    await expect(store.getNumber()).to.be.revertedWithCustomError(store, "WrongMode");
  });
});
