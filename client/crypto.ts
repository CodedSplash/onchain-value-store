// AES-256-GCM encryption for private-mode ValueStore values (spec section 8).
// Wire format: version (1 byte, 0x01) | iv (12 bytes) | ciphertext | authTag (16 bytes).
// AAD: UTF-8 "chainId:contractAddressLowercase:field".
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { DecryptionError, InvalidKeyError, InvalidValueError } from "./errors.js";

export type Field = "string" | "number";

export const FORMAT_VERSION = 0x01;
export const KEY_BYTES = 32;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
/** Bytes added to the plaintext by the wire format. */
export const OVERHEAD_BYTES = 1 + IV_BYTES + TAG_BYTES;

const MAX_UINT256 = (1n << 256n) - 1n;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

/** Where a ciphertext belongs. Encrypting and decrypting must use the same binding. */
export interface Binding {
  readonly chainId: bigint;
  readonly address: string;
  readonly field: Field;
}

/** Generates a fresh random 32-byte key. */
export function generateKey(): Uint8Array {
  return new Uint8Array(randomBytes(KEY_BYTES));
}

/** Hex encoding of a key, without 0x (the format stored in VALUESTORE_KEY). */
export function keyToHex(key: Uint8Array): string {
  return Buffer.from(key).toString("hex");
}

/** Parses a 64-char hex key (optionally 0x-prefixed). Throws `InvalidKeyError`. */
export function parseKey(key: string | Uint8Array): Uint8Array {
  if (key instanceof Uint8Array) {
    if (key.length !== KEY_BYTES) throw new InvalidKeyError(`Key must be ${KEY_BYTES} bytes, got ${key.length}.`);
    return key;
  }
  const hex = key.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new InvalidKeyError(`Key must be ${KEY_BYTES * 2} hex characters (${KEY_BYTES} bytes).`);
  }
  return new Uint8Array(Buffer.from(hex, "hex"));
}

/** Builds the AAD string `chainId:addressLowercase:field` as UTF-8 bytes. */
export function buildAad({ chainId, address, field }: Binding): Uint8Array {
  return new TextEncoder().encode(`${chainId}:${address.toLowerCase()}:${field}`);
}

/** Encrypts raw bytes. A new random IV is used on every call. */
export function encryptBytes(plaintext: Uint8Array, key: Uint8Array, binding: Binding): Uint8Array {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", parseKey(key), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(buildAad(binding));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return new Uint8Array(Buffer.concat([Buffer.of(FORMAT_VERSION), iv, body, cipher.getAuthTag()]));
}

/** Decrypts bytes produced by `encryptBytes`. Throws `DecryptionError` on any failure. */
export function decryptBytes(data: Uint8Array, key: Uint8Array, binding: Binding): Uint8Array {
  if (data.length < OVERHEAD_BYTES) {
    throw new DecryptionError(`Ciphertext too short: ${data.length} bytes, minimum ${OVERHEAD_BYTES}.`);
  }
  if (data[0] !== FORMAT_VERSION) {
    throw new DecryptionError(`Unsupported ciphertext version 0x${(data[0] ?? 0).toString(16).padStart(2, "0")}.`);
  }
  const iv = data.subarray(1, 1 + IV_BYTES);
  const body = data.subarray(1 + IV_BYTES, data.length - TAG_BYTES);
  const tag = data.subarray(data.length - TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", parseKey(key), iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(buildAad(binding));
    decipher.setAuthTag(tag);
    return new Uint8Array(Buffer.concat([decipher.update(body), decipher.final()]));
  } catch (cause) {
    throw new DecryptionError(
      "Decryption failed: wrong key, corrupted ciphertext, or ciphertext from another contract/field.",
      { cause },
    );
  }
}

/** Encrypts a string as UTF-8. */
export function encryptString(value: string, key: Uint8Array, binding: Omit<Binding, "field">): Uint8Array {
  return encryptBytes(new TextEncoder().encode(value), key, { ...binding, field: "string" });
}

/** Decrypts a string. Invalid UTF-8 is reported as `DecryptionError`. */
export function decryptString(data: Uint8Array, key: Uint8Array, binding: Omit<Binding, "field">): string {
  const bytes = decryptBytes(data, key, { ...binding, field: "string" });
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new DecryptionError("Decrypted string is not valid UTF-8.", { cause });
  }
}

/** Encrypts a uint256 as its decimal string in UTF-8. */
export function encryptNumber(value: bigint, key: Uint8Array, binding: Omit<Binding, "field">): Uint8Array {
  assertUint256(value);
  return encryptBytes(new TextEncoder().encode(value.toString(10)), key, { ...binding, field: "number" });
}

/** Decrypts a uint256. A plaintext that is not a canonical decimal uint256 is a `DecryptionError`. */
export function decryptNumber(data: Uint8Array, key: Uint8Array, binding: Omit<Binding, "field">): bigint {
  const text = new TextDecoder().decode(decryptBytes(data, key, { ...binding, field: "number" }));
  if (!DECIMAL.test(text)) throw new DecryptionError("Decrypted number is not a decimal integer.");
  const value = BigInt(text);
  if (value > MAX_UINT256) throw new DecryptionError("Decrypted number exceeds uint256.");
  return value;
}

/** Throws `InvalidValueError` unless 0 <= value <= 2^256 - 1. */
export function assertUint256(value: bigint): void {
  if (typeof value !== "bigint" || value < 0n || value > MAX_UINT256) {
    throw new InvalidValueError("Number must be a bigint in the uint256 range [0, 2^256 - 1].");
  }
}
