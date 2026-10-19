// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title ValueStore
 * @author ValueStore contributors
 * @notice Stores two independent values, a string and a number, that the owner
 * and owner-appointed editors may change and anyone may read for free.
 * @dev The mode is fixed at deployment:
 * - `Public`: values are stored as plain `string` / `uint256`;
 * - `Private`: only client-side encrypted ciphertext (`bytes`) is stored.
 *   Encryption and decryption happen off-chain; the key never touches the chain.
 * Reading cannot be restricted on a public blockchain: in `Private` mode anyone
 * can read the ciphertext, only the key holder can decrypt it.
 * Testnet / educational contract. Not audited.
 */
contract ValueStore is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Storage mode, chosen once in the constructor.
    enum Mode {
        Public,
        Private
    }

    /// @notice Maximum length of a public string value, in bytes (UTF-8).
    uint256 public constant MAX_STRING_BYTES = 1024;
    /// @notice Maximum length of an encrypted value, in bytes.
    uint256 public constant MAX_CIPHERTEXT_BYTES = 2048;
    /// @notice Maximum number of editors (the owner is not counted).
    uint256 public constant MAX_EDITORS = 32;

    /// @notice Storage mode of this contract. Never changes.
    /// @dev Named `mode` (not SNAKE_CASE) because `mode()` is part of the spec'd interface.
    Mode public immutable mode; // solhint-disable-line immutable-vars-naming

    /// @notice Counter incremented on every value change or clear.
    /// @dev Clients may use it as a cache key.
    uint256 public revision;

    string private _string;
    uint256 private _number;
    bytes private _encString;
    bytes private _encNumber;
    bool private _hasString;
    bool private _hasNumber;
    EnumerableSet.AddressSet private _editors;

    /// @notice Caller is not allowed to perform this action.
    /// @param caller The address that made the call.
    error NotAuthorized(address caller);
    /// @notice Function belongs to the other storage mode.
    error WrongMode();
    /// @notice Value exceeds the allowed length.
    /// @param max Maximum allowed length in bytes.
    /// @param actual Length of the provided value in bytes.
    error ValueTooLong(uint256 max, uint256 actual);
    /// @notice Empty string or empty ciphertext passed to a setter; use `clear*` instead.
    error EmptyValue();
    /// @notice The zero address is not allowed here.
    error ZeroAddress();
    /// @notice Account already has editor rights (it is an editor or the owner).
    /// @param account The account that was passed.
    error AlreadyEditor(address account);
    /// @notice Account is not in the editor list.
    /// @param account The account that was passed.
    error NotEditor(address account);
    /// @notice Editor list already holds `MAX_EDITORS` entries.
    error TooManyEditors();
    /// @notice Renouncing ownership is disabled for this contract.
    error RenounceDisabled();

    /// @notice String value (plain or encrypted) was set.
    /// @param by Account that made the change.
    /// @param revision Revision after the change.
    event StringUpdated(address indexed by, uint256 revision);
    /// @notice Number value (plain or encrypted) was set.
    /// @param by Account that made the change.
    /// @param revision Revision after the change.
    event NumberUpdated(address indexed by, uint256 revision);
    /// @notice String value was cleared.
    /// @param by Account that made the change.
    /// @param revision Revision after the change.
    event StringCleared(address indexed by, uint256 revision);
    /// @notice Number value was cleared.
    /// @param by Account that made the change.
    /// @param revision Revision after the change.
    event NumberCleared(address indexed by, uint256 revision);
    /// @notice Account was granted editor rights.
    /// @param editor The new editor.
    event EditorAdded(address indexed editor);
    /// @notice Account lost editor rights.
    /// @param editor The removed editor.
    event EditorRemoved(address indexed editor);

    /// @dev Restricts a function to the owner or an editor.
    modifier onlyEditor() {
        if (!canEdit(msg.sender)) revert NotAuthorized(msg.sender);
        _;
    }

    /// @dev Restricts a function to the given storage mode.
    modifier onlyMode(Mode required) {
        if (mode != required) revert WrongMode();
        _;
    }

    /**
     * @notice Deploys the store.
     * @param initialOwner Owner address; must not be zero.
     * @param mode_ Storage mode, fixed forever.
     */
    constructor(address initialOwner, Mode mode_) Ownable(_requireNonZero(initialOwner)) {
        mode = mode_;
    }

    // ------------------------------------------------------------------
    // Read (anyone, free)
    // ------------------------------------------------------------------

    /// @notice Whether a string value is currently set.
    /// @return True if set, false if never set or cleared.
    function hasString() external view returns (bool) {
        return _hasString;
    }

    /// @notice Whether a number value is currently set.
    /// @dev Needed because `0` is a valid value.
    /// @return True if set, false if never set or cleared.
    function hasNumber() external view returns (bool) {
        return _hasNumber;
    }

    /// @notice Plain string value. `Public` mode only.
    /// @return The value, or an empty string if not set (check `hasString`).
    function getString() external view onlyMode(Mode.Public) returns (string memory) {
        return _string;
    }

    /// @notice Plain number value. `Public` mode only.
    /// @return The value, or 0 if not set (check `hasNumber`).
    function getNumber() external view onlyMode(Mode.Public) returns (uint256) {
        return _number;
    }

    /// @notice Encrypted string value. `Private` mode only.
    /// @return The ciphertext, or empty bytes if not set (check `hasString`).
    function getEncryptedString() external view onlyMode(Mode.Private) returns (bytes memory) {
        return _encString;
    }

    /// @notice Encrypted number value. `Private` mode only.
    /// @return The ciphertext, or empty bytes if not set (check `hasNumber`).
    function getEncryptedNumber() external view onlyMode(Mode.Private) returns (bytes memory) {
        return _encNumber;
    }

    /// @notice List of editors. The owner is not included but can always edit.
    /// @return Editor addresses, in no particular order.
    function getEditors() external view returns (address[] memory) {
        return _editors.values();
    }

    /// @notice Whether `account` may change values.
    /// @param account Address to check.
    /// @return True for the owner and for editors.
    function canEdit(address account) public view returns (bool) {
        return account == owner() || _editors.contains(account);
    }

    // ------------------------------------------------------------------
    // Write (owner or editor)
    // ------------------------------------------------------------------

    /// @notice Sets the plain string value. `Public` mode only.
    /// @param value Non-empty UTF-8 string of at most `MAX_STRING_BYTES` bytes.
    function setString(string calldata value) external onlyEditor onlyMode(Mode.Public) {
        _checkLength(bytes(value).length, MAX_STRING_BYTES);
        _string = value;
        _hasString = true;
        emit StringUpdated(msg.sender, ++revision);
    }

    /// @notice Sets the plain number value. `Public` mode only.
    /// @param value Any `uint256`, including 0.
    function setNumber(uint256 value) external onlyEditor onlyMode(Mode.Public) {
        _number = value;
        _hasNumber = true;
        emit NumberUpdated(msg.sender, ++revision);
    }

    /// @notice Sets the encrypted string value. `Private` mode only.
    /// @dev The contract does not inspect the ciphertext format.
    /// @param data Non-empty ciphertext of at most `MAX_CIPHERTEXT_BYTES` bytes.
    function setEncryptedString(bytes calldata data) external onlyEditor onlyMode(Mode.Private) {
        _checkLength(data.length, MAX_CIPHERTEXT_BYTES);
        _encString = data;
        _hasString = true;
        emit StringUpdated(msg.sender, ++revision);
    }

    /// @notice Sets the encrypted number value. `Private` mode only.
    /// @dev The contract does not inspect the ciphertext format.
    /// @param data Non-empty ciphertext of at most `MAX_CIPHERTEXT_BYTES` bytes.
    function setEncryptedNumber(bytes calldata data) external onlyEditor onlyMode(Mode.Private) {
        _checkLength(data.length, MAX_CIPHERTEXT_BYTES);
        _encNumber = data;
        _hasNumber = true;
        emit NumberUpdated(msg.sender, ++revision);
    }

    /// @notice Clears the string value in the current mode. Works even if not set.
    function clearString() external onlyEditor {
        if (mode == Mode.Public) {
            delete _string;
        } else {
            delete _encString;
        }
        _hasString = false;
        emit StringCleared(msg.sender, ++revision);
    }

    /// @notice Clears the number value in the current mode. Works even if not set.
    function clearNumber() external onlyEditor {
        if (mode == Mode.Public) {
            delete _number;
        } else {
            delete _encNumber;
        }
        _hasNumber = false;
        emit NumberCleared(msg.sender, ++revision);
    }

    // ------------------------------------------------------------------
    // Management (owner only)
    // ------------------------------------------------------------------

    /// @notice Grants editor rights to `account`.
    /// @param account Non-zero address that is neither an editor nor the owner.
    function addEditor(address account) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        if (account == owner()) revert AlreadyEditor(account);
        if (_editors.length() == MAX_EDITORS) revert TooManyEditors();
        if (!_editors.add(account)) revert AlreadyEditor(account);
        emit EditorAdded(account);
    }

    /// @notice Revokes editor rights from `account`.
    /// @param account An address currently in the editor list.
    function removeEditor(address account) external onlyOwner {
        if (!_editors.remove(account)) revert NotEditor(account);
        emit EditorRemoved(account);
    }

    /// @notice Transfers ownership; the old owner loses all rights at once.
    /// @dev Reverts with `ZeroAddress` instead of OpenZeppelin's `OwnableInvalidOwner`.
    /// @param newOwner Non-zero address of the new owner.
    function transferOwnership(address newOwner) public override onlyOwner {
        _requireNonZero(newOwner);
        super.transferOwnership(newOwner);
    }

    /// @notice Disabled: always reverts with `RenounceDisabled`.
    /// @dev Without an owner nobody could manage editors any more.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    /// @dev Replaces OpenZeppelin's `OwnableUnauthorizedAccount` with `NotAuthorized`
    /// so that every permission failure uses the same error.
    function _checkOwner() internal view override {
        if (msg.sender != owner()) revert NotAuthorized(msg.sender);
    }

    /// @dev Reverts with `EmptyValue` for 0 and `ValueTooLong` above `max`.
    function _checkLength(uint256 length, uint256 max) private pure {
        if (length == 0) revert EmptyValue();
        if (length > max) revert ValueTooLong(max, length);
    }

    /// @dev Reverts with `ZeroAddress` for the zero address, otherwise returns it.
    function _requireNonZero(address account) private pure returns (address) {
        if (account == address(0)) revert ZeroAddress();
        return account;
    }
}
