import { expect } from "chai";

import {
  FORMAT_VERSION,
  IV_BYTES,
  OVERHEAD_BYTES,
  TAG_BYTES,
  buildAad,
  decryptBytes,
  decryptNumber,
  decryptString,
  encryptBytes,
  encryptNumber,
  encryptString,
  generateKey,
  keyToHex,
  parseKey,
} from "../../client/crypto.js";
import { DecryptionError, InvalidKeyError, InvalidValueError } from "../../client/errors.js";

const ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const OTHER_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const binding = { chainId: 11155111n, address: ADDRESS };
const MAX_UINT256 = 2n ** 256n - 1n;

describe("crypto: keys", function () {
  it("generates 32 random bytes", function () {
    const a = generateKey();
    const b = generateKey();
    expect(a).to.have.length(32);
    expect(keyToHex(a)).to.not.equal(keyToHex(b));
  });

  it("parses hex with or without 0x and round-trips through keyToHex", function () {
    const key = generateKey();
    const hex = keyToHex(key);
    expect(hex).to.match(/^[0-9a-f]{64}$/);
    expect(parseKey(hex)).to.deep.equal(key);
    expect(parseKey(`0x${hex.toUpperCase()}`)).to.deep.equal(key);
  });

  it("rejects malformed keys with InvalidKeyError", function () {
    for (const bad of ["", "abcd", "zz".repeat(32), "00".repeat(31), "00".repeat(33)]) {
      expect(() => parseKey(bad)).to.throw(InvalidKeyError);
    }
    expect(() => parseKey(new Uint8Array(16))).to.throw(InvalidKeyError);
  });
});

describe("crypto: format", function () {
  it("uses version | iv(12) | ciphertext | tag(16)", function () {
    const key = generateKey();
    const plaintext = new TextEncoder().encode("hello");
    const data = encryptBytes(plaintext, key, { ...binding, field: "string" });
    expect(data[0]).to.equal(FORMAT_VERSION);
    expect(data).to.have.length(1 + IV_BYTES + plaintext.length + TAG_BYTES);
    expect(OVERHEAD_BYTES).to.equal(29);
  });

  it("AAD is chainId:addressLowercase:field", function () {
    const aad = new TextDecoder().decode(buildAad({ chainId: 31337n, address: ADDRESS, field: "number" }));
    expect(aad).to.equal(`31337:${ADDRESS.toLowerCase()}:number`);
  });

  it("uses a different IV for every encryption of the same value", function () {
    const key = generateKey();
    const ivs = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const data = encryptString("same value", key, binding);
      ivs.add(Buffer.from(data.subarray(1, 1 + IV_BYTES)).toString("hex"));
    }
    expect(ivs.size).to.equal(20);
  });

  it("address checksum case does not change the binding", function () {
    const key = generateKey();
    const data = encryptString("x", key, { chainId: 1n, address: ADDRESS });
    expect(decryptString(data, key, { chainId: 1n, address: ADDRESS.toLowerCase() })).to.equal("x");
  });
});

describe("crypto: round-trip", function () {
  const key = generateKey();

  for (const value of ["hello", "Привет, мир", "emoji 👋🏽🚀👨‍👩‍👧", "漢字かな", "a".repeat(2019), " "]) {
    it(`string ${JSON.stringify(value.slice(0, 20))}${value.length > 20 ? "…" : ""}`, function () {
      expect(decryptString(encryptString(value, key, binding), key, binding)).to.equal(value);
    });
  }

  for (const value of [0n, 1n, 42n, 10n ** 30n, MAX_UINT256]) {
    it(`number ${value}`, function () {
      expect(decryptNumber(encryptNumber(value, key, binding), key, binding)).to.equal(value);
    });
  }

  it("rejects numbers outside uint256 with InvalidValueError", function () {
    expect(() => encryptNumber(-1n, key, binding)).to.throw(InvalidValueError);
    expect(() => encryptNumber(MAX_UINT256 + 1n, key, binding)).to.throw(InvalidValueError);
  });
});

describe("crypto: DecryptionError", function () {
  const key = generateKey();
  const data = encryptString("secret", key, binding);

  it("wrong key", function () {
    expect(() => decryptString(data, generateKey(), binding)).to.throw(DecryptionError);
  });

  it("corrupted ciphertext body, IV or tag", function () {
    for (const index of [1, 1 + IV_BYTES, data.length - 1]) {
      const corrupted = Uint8Array.from(data);
      corrupted[index]! ^= 0x01;
      expect(() => decryptString(corrupted, key, binding)).to.throw(DecryptionError);
    }
  });

  it("truncated ciphertext", function () {
    expect(() => decryptString(data.subarray(0, data.length - 1), key, binding)).to.throw(DecryptionError);
    expect(() => decryptString(data.subarray(0, 10), key, binding)).to.throw(DecryptionError, /too short/);
    expect(() => decryptString(new Uint8Array(0), key, binding)).to.throw(DecryptionError);
  });

  it("unknown format version", function () {
    const v2 = Uint8Array.from(data);
    v2[0] = 0x02;
    expect(() => decryptString(v2, key, binding)).to.throw(DecryptionError, /version 0x02/);
  });

  it("swapped AAD: other field (string ciphertext read as number)", function () {
    expect(() => decryptNumber(data, key, binding)).to.throw(DecryptionError);
    const num = encryptNumber(5n, key, binding);
    expect(() => decryptString(num, key, binding)).to.throw(DecryptionError);
  });

  it("swapped AAD: other contract address", function () {
    expect(() => decryptString(data, key, { ...binding, address: OTHER_ADDRESS })).to.throw(DecryptionError);
  });

  it("swapped AAD: other chain", function () {
    expect(() => decryptString(data, key, { ...binding, chainId: 31337n })).to.throw(DecryptionError);
  });

  it("number plaintext that is not a canonical uint256", function () {
    const asNumber = { ...binding, field: "number" as const };
    for (const text of ["abc", "-1", "01", "1.5", "", (2n ** 256n).toString()]) {
      const forged = encryptBytes(new TextEncoder().encode(text), key, asNumber);
      expect(() => decryptNumber(forged, key, binding)).to.throw(DecryptionError);
    }
  });

  it("string plaintext that is not valid UTF-8", function () {
    const forged = encryptBytes(Uint8Array.of(0xff, 0xfe), key, { ...binding, field: "string" });
    expect(() => decryptString(forged, key, binding)).to.throw(DecryptionError, /UTF-8/);
  });

  it("keeps the underlying cause", function () {
    try {
      decryptBytes(data, generateKey(), { ...binding, field: "string" });
      expect.fail("should throw");
    } catch (error) {
      expect(error).to.be.instanceOf(DecryptionError);
      expect((error as DecryptionError).cause).to.be.instanceOf(Error);
    }
  });
});
