import { Contract, JsonRpcProvider, getAddress, getBytes, isAddress, type ContractRunner, type Provider } from "ethers";

import { VALUE_STORE_ABI } from "./abi.js";
import { decryptNumber, decryptString, parseKey, type Binding } from "./crypto.js";
import { KeyRequired, ValueStoreError } from "./errors.js";

export type StoreMode = "public" | "private";

export interface ReaderOptions {
  /** ValueStore contract address. */
  readonly address: string;
  /** JSON-RPC URL. Either `rpcUrl` or `provider` is required. */
  readonly rpcUrl?: string;
  /** Existing ethers provider (takes precedence over `rpcUrl`). */
  readonly provider?: Provider;
  /** AES-256 key (64 hex chars or 32 bytes). Needed only for private mode. */
  readonly key?: string | Uint8Array;
}

const MAX_READ_ATTEMPTS = 3;

/**
 * Read-only ValueStore client. Needs no wallet: every call is a free `eth_call`.
 * The contract mode is detected automatically on first use.
 */
export class ValueStoreReader {
  readonly address: string;
  protected readonly provider: Provider;
  protected readonly contract: Contract;
  protected readonly key: Uint8Array | null;
  #mode: Promise<StoreMode> | null = null;
  #chainId: Promise<bigint> | null = null;

  protected constructor(options: ReaderOptions, runner?: ContractRunner) {
    if (!isAddress(options.address)) throw new ValueStoreError(`Invalid contract address: "${options.address}"`);
    this.address = getAddress(options.address);
    this.provider = resolveProvider(options);
    this.key = options.key === undefined ? null : parseKey(options.key);
    this.contract = new Contract(this.address, VALUE_STORE_ABI, runner ?? this.provider);
  }

  /** Creates a reader. Only `rpcUrl` (or `provider`) and `address` are required. */
  static connect(options: ReaderOptions): ValueStoreReader {
    return new ValueStoreReader(options);
  }

  /** Contract mode, read once from `mode()` and cached (it is immutable). */
  getMode(): Promise<StoreMode> {
    if (!this.#mode) {
      const mode = this.call<bigint>("mode").then(decodeMode, (cause: unknown) => {
        throw new ValueStoreError(
          `Could not read mode() at ${this.address}. Is this a ValueStore contract on this network?`,
          { cause },
        );
      });
      mode.catch(() => {
        if (this.#mode === mode) this.#mode = null; // allow a retry after a network failure
      });
      this.#mode = mode;
    }
    return this.#mode;
  }

  /** Chain id of the connected network (cached; part of the encryption binding). */
  getChainId(): Promise<bigint> {
    if (!this.#chainId) {
      const chainId = this.provider.getNetwork().then((n) => n.chainId);
      chainId.catch(() => {
        if (this.#chainId === chainId) this.#chainId = null;
      });
      this.#chainId = chainId;
    }
    return this.#chainId;
  }

  hasString(): Promise<boolean> {
    return this.call<boolean>("hasString");
  }

  hasNumber(): Promise<boolean> {
    return this.call<boolean>("hasNumber");
  }

  /** The string value, decrypted in private mode, or `null` if not set. */
  async getString(): Promise<string | null> {
    const mode = await this.getMode();
    const key = mode === "private" ? this.requireKey() : null;
    const { has, raw } = await this.consistentRead(async () => {
      const [has, raw] = await Promise.all([
        this.call<boolean>("hasString"),
        this.call<string>(key ? "getEncryptedString" : "getString"),
      ]);
      return { has, raw };
    });
    if (!has) return null;
    return key ? decryptString(getBytes(raw), key, await this.bindingBase()) : raw;
  }

  /** The number value (always `bigint`), decrypted in private mode, or `null` if not set. */
  async getNumber(): Promise<bigint | null> {
    const mode = await this.getMode();
    const key = mode === "private" ? this.requireKey() : null;
    const { has, raw } = await this.consistentRead(async () => {
      const [has, raw] = await Promise.all([
        this.call<boolean>("hasNumber"),
        this.call<bigint | string>(key ? "getEncryptedNumber" : "getNumber"),
      ]);
      return { has, raw };
    });
    if (!has) return null;
    return key ? decryptNumber(getBytes(raw as string), key, await this.bindingBase()) : (raw as bigint);
  }

  /** Change counter; grows on every set and clear. Useful as a cache key. */
  getRevision(): Promise<bigint> {
    return this.call<bigint>("revision");
  }

  /** Editor addresses (checksummed). The owner is not included. */
  async getEditors(): Promise<string[]> {
    const editors = await this.call<string[]>("getEditors");
    return [...editors];
  }

  getOwner(): Promise<string> {
    return this.call<string>("owner");
  }

  /** Whether `account` is the owner or an editor. */
  async canEdit(account: string): Promise<boolean> {
    return this.call<boolean>("canEdit", getAddress(account));
  }

  protected requireKey(): Uint8Array {
    if (!this.key) throw new KeyRequired();
    return this.key;
  }

  protected async bindingBase(): Promise<Omit<Binding, "field">> {
    return { chainId: await this.getChainId(), address: this.address };
  }

  protected async call<T>(method: string, ...args: unknown[]): Promise<T> {
    return (await this.contract.getFunction(method).staticCall(...args)) as T;
  }

  /**
   * Runs two or more `eth_call`s that must see the same state (e.g. `hasString`
   * and `getString`). `revision` changes on every write, so equal revisions
   * before and after mean no write happened in between. Pinning a block number
   * is not used because ethers caches `getBlockNumber` for a short time.
   */
  private async consistentRead<T>(read: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < MAX_READ_ATTEMPTS; attempt++) {
      const before = await this.getRevision();
      const result = await read();
      if ((await this.getRevision()) === before) return result;
    }
    throw new ValueStoreError("The value kept changing while it was being read; try again.");
  }
}

function resolveProvider(options: ReaderOptions): Provider {
  if (options.provider) return options.provider;
  if (options.rpcUrl) return createProvider(options.rpcUrl);
  throw new ValueStoreError("Either `rpcUrl` or `provider` is required.");
}

/**
 * JSON-RPC provider for the client. ethers caches identical requests for 250 ms
 * by default, which can return a stale nonce or block right after a write; the
 * client turns that cache off.
 */
export function createProvider(rpcUrl: string): JsonRpcProvider {
  return new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
}

function decodeMode(raw: bigint): StoreMode {
  if (raw === 0n) return "public";
  if (raw === 1n) return "private";
  throw new ValueStoreError(`Unknown ValueStore mode ${raw}; is this a ValueStore contract?`);
}
