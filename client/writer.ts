import { getAddress, hexlify, isAddress, type Signer, type TransactionReceipt, type TransactionResponse } from "ethers";

import { MAX_CIPHERTEXT_BYTES, MAX_STRING_BYTES } from "./abi.js";
import { assertUint256, encryptNumber, encryptString } from "./crypto.js";
import { ContractRevertError, InvalidValueError, ValueStoreError } from "./errors.js";
import { ValueStoreReader, createProvider, type ReaderOptions } from "./reader.js";

export interface WriterOptions extends ReaderOptions {
  /** Wallet of the owner or an editor. Connected to `provider`/`rpcUrl` if it has no provider. */
  readonly signer: Signer;
}

/**
 * Read-write ValueStore client. Encrypts automatically in private mode.
 * Every write waits for the transaction to be mined and returns its receipt.
 * Contract reverts are rethrown as `ContractRevertError` (e.g. `NotAuthorized`).
 */
export class ValueStoreWriter extends ValueStoreReader {
  readonly signer: Signer;

  protected constructor(options: ReaderOptions, signer: Signer) {
    super(options, signer);
    this.signer = signer;
  }

  /** Creates a writer. `signer` must be the owner or an editor to write. */
  static override connect(options: WriterOptions): ValueStoreWriter {
    const provider =
      options.provider ??
      options.signer.provider ??
      (options.rpcUrl ? createProvider(options.rpcUrl) : undefined);
    if (!provider) throw new ValueStoreError("Either `rpcUrl`, `provider` or a connected `signer` is required.");
    // A bare Wallet has no provider: attach it so it can send transactions.
    const signer = options.signer.provider ? options.signer : options.signer.connect(provider);
    return new ValueStoreWriter({ ...options, provider }, signer);
  }

  /** Sets the string value (encrypted in private mode). */
  async setString(value: string): Promise<TransactionReceipt> {
    const bytes = new TextEncoder().encode(value);
    if (bytes.length === 0) throw new InvalidValueError("String must not be empty; use clearString() instead.");
    if ((await this.getMode()) === "public") {
      checkLength(bytes.length, MAX_STRING_BYTES, "String");
      return this.send("setString", value);
    }
    const data = encryptString(value, this.requireKey(), await this.bindingBase());
    checkLength(data.length, MAX_CIPHERTEXT_BYTES, "Ciphertext");
    return this.send("setEncryptedString", hexlify(data));
  }

  /** Sets the number value (encrypted in private mode). Any uint256 including 0. */
  async setNumber(value: bigint): Promise<TransactionReceipt> {
    assertUint256(value);
    if ((await this.getMode()) === "public") return this.send("setNumber", value);
    const data = encryptNumber(value, this.requireKey(), await this.bindingBase());
    return this.send("setEncryptedNumber", hexlify(data));
  }

  clearString(): Promise<TransactionReceipt> {
    return this.send("clearString");
  }

  clearNumber(): Promise<TransactionReceipt> {
    return this.send("clearNumber");
  }

  /** Owner only: grants editor rights. */
  async addEditor(account: string): Promise<TransactionReceipt> {
    return this.send("addEditor", checkAddress(account));
  }

  /** Owner only: revokes editor rights. */
  async removeEditor(account: string): Promise<TransactionReceipt> {
    return this.send("removeEditor", checkAddress(account));
  }

  private async send(method: string, ...args: unknown[]): Promise<TransactionReceipt> {
    let receipt: TransactionReceipt | null;
    try {
      const tx = (await this.contract.getFunction(method).send(...args)) as TransactionResponse;
      receipt = await tx.wait();
    } catch (error) {
      throw this.decodeRevert(error) ?? error;
    }
    if (!receipt) throw new ValueStoreError(`Transaction for ${method}() was not mined.`);
    return receipt;
  }

  /** Maps revert data found anywhere in a provider error to a `ContractRevertError`. */
  private decodeRevert(error: unknown): ContractRevertError | null {
    for (const data of findRevertData(error)) {
      try {
        const parsed = this.contract.interface.parseError(data);
        if (parsed) return new ContractRevertError(parsed.name, [...parsed.args], { cause: error });
      } catch {
        // not one of our errors; keep looking
      }
    }
    return null;
  }
}

function checkLength(actual: number, max: number, what: string): void {
  if (actual > max) throw new InvalidValueError(`${what} is ${actual} bytes; the maximum is ${max}.`);
}

function checkAddress(account: string): string {
  if (!isAddress(account)) throw new InvalidValueError(`Invalid address: "${account}"`);
  return getAddress(account);
}

/** Collects every `data` hex string nested in an error (ethers and Hardhat wrap them differently). */
function findRevertData(error: unknown, depth = 0, found: string[] = []): string[] {
  if (depth > 6 || error === null || typeof error !== "object") return found;
  for (const [key, value] of Object.entries(error)) {
    if (key === "data" && typeof value === "string" && /^0x[0-9a-fA-F]{8,}$/.test(value)) found.push(value);
    else if (typeof value === "object") findRevertData(value, depth + 1, found);
  }
  return found;
}
