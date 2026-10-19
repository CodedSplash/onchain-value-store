/** Minimal ValueStore ABI used by the client (no Hardhat artifacts needed). */
export const VALUE_STORE_ABI = [
  "function mode() view returns (uint8)",
  "function owner() view returns (address)",
  "function hasString() view returns (bool)",
  "function hasNumber() view returns (bool)",
  "function getString() view returns (string)",
  "function getNumber() view returns (uint256)",
  "function getEncryptedString() view returns (bytes)",
  "function getEncryptedNumber() view returns (bytes)",
  "function revision() view returns (uint256)",
  "function canEdit(address account) view returns (bool)",
  "function getEditors() view returns (address[])",
  "function setString(string value)",
  "function setNumber(uint256 value)",
  "function setEncryptedString(bytes data)",
  "function setEncryptedNumber(bytes data)",
  "function clearString()",
  "function clearNumber()",
  "function addEditor(address account)",
  "function removeEditor(address account)",
  "function transferOwnership(address newOwner)",
  "error NotAuthorized(address caller)",
  "error WrongMode()",
  "error ValueTooLong(uint256 max, uint256 actual)",
  "error EmptyValue()",
  "error ZeroAddress()",
  "error AlreadyEditor(address account)",
  "error NotEditor(address account)",
  "error TooManyEditors()",
  "error RenounceDisabled()",
] as const;

/** Limits mirrored from the contract constants. */
export const MAX_STRING_BYTES = 1024;
export const MAX_CIPHERTEXT_BYTES = 2048;
export const MAX_EDITORS = 32;
