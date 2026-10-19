/** Base class for every error thrown by the ValueStore client. */
export class ValueStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A private-mode contract was read or written without an encryption key. */
export class KeyRequired extends ValueStoreError {
  constructor() {
    super("This ValueStore is in private mode: an encryption key (VALUESTORE_KEY) is required.");
  }
}

/** The encryption key is malformed (must be 32 bytes / 64 hex chars). */
export class InvalidKeyError extends ValueStoreError {}

/**
 * Ciphertext could not be decrypted: wrong key, corrupted data, unknown format
 * version, or ciphertext bound to another chain / contract / field (AAD mismatch).
 */
export class DecryptionError extends ValueStoreError {}

/** A value was rejected by the client before sending (empty, too long, out of range). */
export class InvalidValueError extends ValueStoreError {}

/** The contract reverted with one of its custom errors (e.g. `NotAuthorized`). */
export class ContractRevertError extends ValueStoreError {
  constructor(
    /** Custom error name from the contract, e.g. `NotAuthorized`. */
    readonly errorName: string,
    /** Decoded error arguments. */
    readonly errorArgs: readonly unknown[],
    options?: ErrorOptions,
  ) {
    super(`ValueStore reverted: ${errorName}(${errorArgs.map(String).join(", ")})`, options);
  }
}
