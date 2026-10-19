import { expect } from "chai";

import { ethers, networkHelpers, privateFixture, publicFixture } from "../helpers/fixtures.js";

const { loadFixture } = networkHelpers;

describe("ValueStore: editors", function () {
  it("owner adds an editor: EditorAdded, canEdit, getEditors", async function () {
    const { store, other } = await loadFixture(publicFixture);
    await expect(store.addEditor(other.address)).to.emit(store, "EditorAdded").withArgs(other.address);
    expect(await store.canEdit(other.address)).to.equal(true);
    expect(await store.getEditors()).to.include(other.address);
  });

  it("owner can edit implicitly and is not listed as editor", async function () {
    const { store, owner, editor } = await loadFixture(publicFixture);
    expect(await store.canEdit(owner.address)).to.equal(true);
    expect(await store.getEditors()).to.deep.equal([editor.address]);
  });

  it("stranger cannot edit", async function () {
    const { store, stranger } = await loadFixture(publicFixture);
    expect(await store.canEdit(stranger.address)).to.equal(false);
  });

  it("owner removes an editor: EditorRemoved, editor can no longer write", async function () {
    const { store, editor } = await loadFixture(publicFixture);
    await expect(store.removeEditor(editor.address)).to.emit(store, "EditorRemoved").withArgs(editor.address);
    expect(await store.canEdit(editor.address)).to.equal(false);
    expect(await store.getEditors()).to.deep.equal([]);
    await expect(store.connect(editor).setString("x"))
      .to.be.revertedWithCustomError(store, "NotAuthorized")
      .withArgs(editor.address);
  });

  it("removed editor can no longer write in Private mode", async function () {
    const { store, editor } = await loadFixture(privateFixture);
    await store.removeEditor(editor.address);
    await expect(store.connect(editor).setEncryptedString("0x01"))
      .to.be.revertedWithCustomError(store, "NotAuthorized")
      .withArgs(editor.address);
  });

  it("editor cannot add or remove editors: NotAuthorized", async function () {
    const { store, editor, other } = await loadFixture(publicFixture);
    await expect(store.connect(editor).addEditor(other.address))
      .to.be.revertedWithCustomError(store, "NotAuthorized")
      .withArgs(editor.address);
    await expect(store.connect(editor).removeEditor(editor.address))
      .to.be.revertedWithCustomError(store, "NotAuthorized")
      .withArgs(editor.address);
  });

  it("stranger cannot add editors: NotAuthorized", async function () {
    const { store, stranger } = await loadFixture(publicFixture);
    await expect(store.connect(stranger).addEditor(stranger.address))
      .to.be.revertedWithCustomError(store, "NotAuthorized")
      .withArgs(stranger.address);
  });

  it("adding a duplicate: AlreadyEditor", async function () {
    const { store, editor } = await loadFixture(publicFixture);
    await expect(store.addEditor(editor.address))
      .to.be.revertedWithCustomError(store, "AlreadyEditor")
      .withArgs(editor.address);
  });

  it("adding the owner: AlreadyEditor (owner is an implicit editor)", async function () {
    const { store, owner } = await loadFixture(publicFixture);
    await expect(store.addEditor(owner.address))
      .to.be.revertedWithCustomError(store, "AlreadyEditor")
      .withArgs(owner.address);
  });

  it("removing a non-editor: NotEditor", async function () {
    const { store, stranger } = await loadFixture(publicFixture);
    await expect(store.removeEditor(stranger.address))
      .to.be.revertedWithCustomError(store, "NotEditor")
      .withArgs(stranger.address);
  });

  it("adding the zero address: ZeroAddress", async function () {
    const { store } = await loadFixture(publicFixture);
    await expect(store.addEditor(ethers.ZeroAddress)).to.be.revertedWithCustomError(store, "ZeroAddress");
  });

  it("allows up to MAX_EDITORS editors, then TooManyEditors", async function () {
    const { store } = await loadFixture(publicFixture);
    // The fixture already added one editor.
    for (let i = 1; i < 32; i++) {
      await store.addEditor(ethers.Wallet.createRandom().address);
    }
    expect(await store.getEditors()).to.have.length(32);
    await expect(store.addEditor(ethers.Wallet.createRandom().address)).to.be.revertedWithCustomError(
      store,
      "TooManyEditors",
    );
  });

  it("a freed slot can be reused after removal", async function () {
    const { store, editor } = await loadFixture(publicFixture);
    for (let i = 1; i < 32; i++) {
      await store.addEditor(ethers.Wallet.createRandom().address);
    }
    await store.removeEditor(editor.address);
    await expect(store.addEditor(editor.address)).to.emit(store, "EditorAdded").withArgs(editor.address);
  });
});

describe("ValueStore: ownership", function () {
  it("renounceOwnership always fails with RenounceDisabled", async function () {
    const { store, editor, owner } = await loadFixture(publicFixture);
    await expect(store.renounceOwnership()).to.be.revertedWithCustomError(store, "RenounceDisabled");
    await expect(store.connect(editor).renounceOwnership()).to.be.revertedWithCustomError(
      store,
      "RenounceDisabled",
    );
    expect(await store.owner()).to.equal(owner.address);
  });

  it("transferOwnership: new owner gets rights, old owner loses them", async function () {
    const { store, owner, other } = await loadFixture(publicFixture);
    await expect(store.transferOwnership(other.address))
      .to.emit(store, "OwnershipTransferred")
      .withArgs(owner.address, other.address);
    expect(await store.owner()).to.equal(other.address);
    expect(await store.canEdit(other.address)).to.equal(true);
    expect(await store.canEdit(owner.address)).to.equal(false);

    await expect(store.connect(other).setString("new owner")).to.emit(store, "StringUpdated");
    await expect(store.setString("old owner"))
      .to.be.revertedWithCustomError(store, "NotAuthorized")
      .withArgs(owner.address);
    await expect(store.addEditor(owner.address))
      .to.be.revertedWithCustomError(store, "NotAuthorized")
      .withArgs(owner.address);
    await expect(store.connect(other).addEditor(owner.address)).to.emit(store, "EditorAdded");
  });

  it("transferOwnership to the zero address: ZeroAddress", async function () {
    const { store } = await loadFixture(publicFixture);
    await expect(store.transferOwnership(ethers.ZeroAddress)).to.be.revertedWithCustomError(store, "ZeroAddress");
  });

  it("editor cannot transfer ownership: NotAuthorized", async function () {
    const { store, editor } = await loadFixture(publicFixture);
    await expect(store.connect(editor).transferOwnership(editor.address))
      .to.be.revertedWithCustomError(store, "NotAuthorized")
      .withArgs(editor.address);
  });

  it("editors keep their rights across an ownership transfer", async function () {
    const { store, editor, other } = await loadFixture(publicFixture);
    await store.transferOwnership(other.address);
    expect(await store.canEdit(editor.address)).to.equal(true);
  });
});
