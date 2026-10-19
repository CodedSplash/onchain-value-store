import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect } from "chai";

import { deployValueStore } from "../../scripts/lib/deploy-core.js";
import { ConfigError, parseDeployConfig } from "../../scripts/lib/deploy-config.js";
import { deploymentPath, loadDeployment, saveDeployment } from "../../scripts/lib/deployments.js";
import { NetworkNotAllowedError, assertAllowedNetwork, explorerAddressUrl } from "../../scripts/lib/networks.js";
import { Mode, ethers } from "../helpers/fixtures.js";

describe("deploy: network whitelist", function () {
  it("allows Sepolia, Hoodi and Hardhat local", function () {
    expect(assertAllowedNetwork(11155111n).label).to.equal("Sepolia");
    expect(assertAllowedNetwork(560048n).label).to.equal("Hoodi");
    expect(assertAllowedNetwork(31337n).local).to.equal(true);
  });

  it("refuses mainnet with an explicit message", function () {
    expect(() => assertAllowedNetwork(1n))
      .to.throw(NetworkNotAllowedError)
      .with.property("message")
      .that.matches(/mainnet is forbidden/);
  });

  it("refuses any other chain", function () {
    for (const id of [5n, 10n, 137n, 8453n, 42161n]) {
      expect(() => assertAllowedNetwork(id)).to.throw(NetworkNotAllowedError);
    }
  });

  it("builds explorer links only for public testnets", function () {
    const addr = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    expect(explorerAddressUrl(assertAllowedNetwork(11155111n), addr)).to.equal(
      `https://sepolia.etherscan.io/address/${addr}`,
    );
    expect(explorerAddressUrl(assertAllowedNetwork(31337n), addr)).to.equal(null);
  });
});

describe("deploy: config parsing", function () {
  it("parses mode, owner and confirmations", function () {
    const owner = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    expect(parseDeployConfig({ MODE: " Private ", INITIAL_OWNER: owner, CONFIRMATIONS: "5" })).to.deep.equal({
      mode: "private",
      initialOwner: owner,
      confirmations: 5,
    });
  });

  it("defaults: deployer as owner, 2 confirmations", function () {
    expect(parseDeployConfig({ MODE: "public", INITIAL_OWNER: "" })).to.deep.equal({
      mode: "public",
      initialOwner: null,
      confirmations: 2,
    });
  });

  it("rejects a missing or invalid MODE", function () {
    expect(() => parseDeployConfig({})).to.throw(ConfigError, /MODE/);
    expect(() => parseDeployConfig({ MODE: "secret" })).to.throw(ConfigError, /MODE/);
  });

  it("rejects an invalid INITIAL_OWNER", function () {
    expect(() => parseDeployConfig({ MODE: "public", INITIAL_OWNER: "0x1234" })).to.throw(ConfigError, /INITIAL_OWNER/);
  });

  it("rejects invalid CONFIRMATIONS", function () {
    for (const value of ["0", "-1", "1.5", "abc"]) {
      expect(() => parseDeployConfig({ MODE: "public", CONFIRMATIONS: value })).to.throw(ConfigError, /CONFIRMATIONS/);
    }
  });
});

describe("deploy: deployment records", function () {
  let dir: string;
  beforeEach(function () {
    dir = mkdtempSync(path.join(tmpdir(), "valuestore-deployments-"));
  });
  afterEach(function () {
    rmSync(dir, { recursive: true, force: true });
  });

  it("deploys in both modes and saves deployments/<network>.json", async function () {
    for (const mode of ["public", "private"] as const) {
      const record = await deployValueStore(ethers, "testnet", { mode, initialOwner: null, confirmations: 1 });
      const [deployer] = await ethers.getSigners();
      expect(record.mode).to.equal(mode);
      expect(record.owner).to.equal(deployer!.address);
      expect(record.chainId).to.equal("31337");

      const store = await ethers.getContractAt("ValueStore", record.address);
      expect(await store.mode()).to.equal(mode === "public" ? Mode.Public : Mode.Private);

      const file = saveDeployment(record, dir);
      expect(file).to.equal(path.join(dir, "testnet.json"));
      expect(JSON.parse(readFileSync(file, "utf8"))).to.deep.equal(record);
      expect(loadDeployment("testnet", dir)).to.deep.equal(record);
    }
  });

  it("uses INITIAL_OWNER when given", async function () {
    const [, , , other] = await ethers.getSigners();
    const record = await deployValueStore(ethers, "testnet", {
      mode: "public",
      initialOwner: other!.address,
      confirmations: 1,
    });
    const store = await ethers.getContractAt("ValueStore", record.address);
    expect(await store.owner()).to.equal(other!.address);
    expect(record.owner).to.equal(other!.address);
  });

  it("fails clearly when no deployment exists", function () {
    expect(() => loadDeployment("nowhere", dir)).to.throw(/No deployment found for "nowhere"/);
  });

  it("rejects unsafe network names in file paths", function () {
    expect(() => deploymentPath("../etc", dir)).to.throw(/Invalid network name/);
  });
});
