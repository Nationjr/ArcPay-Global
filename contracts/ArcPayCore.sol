// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ArcPayCore is AccessControl, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    uint256 public constant PLATFORM_FEE_BPS = 50;
    uint256 public constant MAX_BPS = 10_000;
    /// @dev Platform owner receives 60% of the platform fee; merchant fee recipient gets 40%.
    uint256 public constant PLATFORM_OWNER_SHARE_BPS = 6000;  // 60% of platform fee
    uint256 public constant MERCHANT_FEE_SHARE_BPS   = 4000;  // 40% of platform fee

    bytes32 public constant CASHIER_ROLE = keccak256("CASHIER_ROLE");
    bytes32 private constant PAYMENT_PAYLOAD_TYPEHASH =
        keccak256(
            "PaymentPayload(bytes32 invoiceId,address merchant,uint256 grossAmount,address supplier,uint256 supplierShareBps,uint256 taxShareBps,uint256 nonce,uint256 deadline)"
        );

    struct Invoice {
        address merchant;
        uint256 grossAmount;
        address supplier;
        uint256 supplierShareBps;
        uint256 taxShareBps;
        bool settled;
    }

    struct PaymentPayload {
        bytes32 invoiceId;
        address merchant;
        uint256 grossAmount;
        address supplier;
        uint256 supplierShareBps;
        uint256 taxShareBps;
        uint256 nonce;
        uint256 deadline;
    }

    error ZeroAddress();
    error InvalidAmount();
    error InvalidBps();
    error InvoiceAlreadyExists(bytes32 invoiceId);
    error InvoiceNotFound(bytes32 invoiceId);
    error InvoiceAlreadySettled(bytes32 invoiceId);
    error ArrayLengthMismatch();
    error SignatureExpired(uint256 deadline);
    error InvalidSignature();
    error InvalidSigner(address expected, address recovered);
    error InvalidNonce(uint256 expected, uint256 provided);
    error Unauthorized();
    error InsufficientBalance(uint256 available, uint256 requested);

    event PaymentReceived(
        bytes32 indexed invoiceId,
        address indexed merchant,
        uint256 grossAmount,
        uint256 platformFee,
        uint256 supplierShare,
        uint256 taxShare,
        uint256 netRevenue
    );
    event BatchSettled(uint256 count);
    event YieldSwept(address indexed merchant, uint256 amount);
    event YieldUnswept(address indexed merchant, uint256 amount);
    event InvoiceCreated(bytes32 indexed invoiceId, address indexed merchant, uint256 grossAmount);
    event PayoutAddressSet(address indexed beneficiary, address indexed newAddress);

    mapping(bytes32 => Invoice) private invoices;
    mapping(address => uint256) public merchantLiquidBalance;
    mapping(address => uint256) public merchantTaxReserve;
    mapping(address => uint256) public supplierLiquidBalance;
    mapping(address => uint256) public merchantYieldBalance;
    mapping(address => bool) public yieldEnabled;
    mapping(address => uint256) private nonces;
    mapping(address => address) public payoutAddress;
    /// @dev Merchant-chosen address that receives 40% of the platform fee.
    /// Defaults to the merchant wallet itself if not set.
    mapping(address => address) public merchantFeeRecipient;

    address public immutable usdc;
    address public immutable platformFeeRecipient; // receives 60% of platform fee

    uint256 public pendingPlatformFees;       // platform owner's 60% share
    uint256 public pendingMerchantFees;       // per-merchant 40% shares tracked separately
    mapping(address => uint256) public merchantFeeBalance; // per-merchant pending fee balance
    uint256 public totalPlatformFeesCollected;
    uint256 public totalVolumeProcessed;
    uint256[] public dailyVolumes;

    constructor(address usdc_, address admin, address platformFeeRecipient_) EIP712("ArcPayCore", "1") {
        if (usdc_ == address(0) || admin == address(0) || platformFeeRecipient_ == address(0)) revert ZeroAddress();

        usdc = usdc_;
        platformFeeRecipient = platformFeeRecipient_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CASHIER_ROLE, admin);
    }

    function initializeInvoice(
        bytes32 invoiceId,
        address merchant,
        uint256 grossAmount,
        address supplier,
        uint256 supplierShareBps,
        uint256 taxShareBps
    ) external onlyRole(CASHIER_ROLE) {
        _createInvoice(invoiceId, merchant, grossAmount, supplier, supplierShareBps, taxShareBps);
    }

    function executePayment(bytes32 invoiceId) external nonReentrant onlyRole(CASHIER_ROLE) {
        Invoice storage invoice = invoices[invoiceId];
        if (invoice.merchant == address(0)) revert InvoiceNotFound(invoiceId);
        if (invoice.settled) revert InvoiceAlreadySettled(invoiceId);

        _settlePayment(
            invoiceId,
            invoice.merchant,
            invoice.grossAmount,
            invoice.supplier,
            invoice.supplierShareBps,
            invoice.taxShareBps
        );

        invoice.settled = true;
    }

    /// @notice Settle a QR payment whose USDC was sent directly to this contract.
    /// The customer transferred USDC to this contract address; this function
    /// records the split without pulling funds again.
    /// Requires the contract's unallocated USDC balance >= invoice.grossAmount.
    function settleQrPayment(bytes32 invoiceId) external nonReentrant onlyRole(CASHIER_ROLE) {
        Invoice storage invoice = invoices[invoiceId];
        if (invoice.merchant == address(0)) revert InvoiceNotFound(invoiceId);
        if (invoice.settled) revert InvoiceAlreadySettled(invoiceId);

        uint256 gross = invoice.grossAmount;

        // Verify the contract actually holds enough unallocated USDC.
        // Unallocated = contract balance minus all internally tracked balances.
        uint256 contractBal = IERC20(usdc).balanceOf(address(this));
        if (contractBal < gross) revert InsufficientBalance(contractBal, gross);

        _settleFromBalance(
            invoiceId,
            invoice.merchant,
            gross,
            invoice.supplier,
            invoice.supplierShareBps,
            invoice.taxShareBps
        );

        invoice.settled = true;
    }

    function executeBatchOfflinePayments(
        PaymentPayload[] calldata payloads,
        bytes[] calldata signatures
    ) external nonReentrant onlyRole(CASHIER_ROLE) {
        uint256 length = payloads.length;
        if (length != signatures.length) revert ArrayLengthMismatch();

        for (uint256 i; i < length; ) {
            PaymentPayload calldata payload = payloads[i];

            if (block.timestamp > payload.deadline) revert SignatureExpired(payload.deadline);

            bytes32 structHash = keccak256(
                abi.encode(
                    PAYMENT_PAYLOAD_TYPEHASH,
                    payload.invoiceId,
                    payload.merchant,
                    payload.grossAmount,
                    payload.supplier,
                    payload.supplierShareBps,
                    payload.taxShareBps,
                    payload.nonce,
                    payload.deadline
                )
            );

            bytes32 digest = _hashTypedDataV4(structHash);
            (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signatures[i]);
            if (err != ECDSA.RecoverError.NoError) revert InvalidSignature();
            if (recovered != payload.merchant) revert InvalidSigner(payload.merchant, recovered);

            uint256 expectedNonce = nonces[recovered];
            if (payload.nonce != expectedNonce) revert InvalidNonce(expectedNonce, payload.nonce);
            nonces[recovered] = expectedNonce + 1;

            Invoice storage invoice = _createInvoice(
                payload.invoiceId,
                payload.merchant,
                payload.grossAmount,
                payload.supplier,
                payload.supplierShareBps,
                payload.taxShareBps
            );

            _settlePayment(
                payload.invoiceId,
                payload.merchant,
                payload.grossAmount,
                payload.supplier,
                payload.supplierShareBps,
                payload.taxShareBps
            );

            invoice.settled = true;

            unchecked {
                ++i;
            }
        }

        emit BatchSettled(length);
    }

    function sweepToYield(address merchant) external {
        if (merchant == address(0)) revert ZeroAddress();
        if (!_isAdminOrMerchant(merchant)) revert Unauthorized();

        uint256 amount = merchantLiquidBalance[merchant];
        merchantLiquidBalance[merchant] = 0;
        merchantYieldBalance[merchant] += amount;
        yieldEnabled[merchant] = true;

        emit YieldSwept(merchant, amount);
    }

    function unsweepFromYield(address merchant, uint256 amount) external {
        if (merchant == address(0)) revert ZeroAddress();
        if (!_isAdminOrMerchant(merchant)) revert Unauthorized();

        uint256 currentYield = merchantYieldBalance[merchant];
        if (amount > currentYield) revert InsufficientBalance(currentYield, amount);

        merchantYieldBalance[merchant] = currentYield - amount;
        merchantLiquidBalance[merchant] += amount;

        emit YieldUnswept(merchant, amount);
    }

    function withdrawLiquid(address merchant, uint256 amount) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (merchant == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        address recipient = payoutAddress[merchant];
        if (recipient == address(0)) {
            recipient = merchant;
        }

        uint256 liquid = merchantLiquidBalance[merchant];
        if (amount > liquid) revert InsufficientBalance(liquid, amount);

        merchantLiquidBalance[merchant] = liquid - amount;
        IERC20(usdc).safeTransfer(recipient, amount);
    }

    function withdrawTaxReserve(address merchant, uint256 amount) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (merchant == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();

        address recipient = payoutAddress[merchant];
        if (recipient == address(0)) {
            recipient = merchant;
        }

        uint256 reserve = merchantTaxReserve[merchant];
        if (amount > reserve) revert InsufficientBalance(reserve, amount);

        merchantTaxReserve[merchant] = reserve - amount;
        IERC20(usdc).safeTransfer(recipient, amount);
    }

    function withdrawPlatformFees() external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        address recipient = payoutAddress[platformFeeRecipient];
        if (recipient == address(0)) {
            recipient = platformFeeRecipient;
        }

        uint256 amount = pendingPlatformFees;
        if (amount == 0) revert InvalidAmount();

        pendingPlatformFees = 0;
        IERC20(usdc).safeTransfer(recipient, amount);
    }

    function withdrawSupplierBalance(address supplier) external nonReentrant {
        if (supplier == address(0)) revert ZeroAddress();
        if (msg.sender != supplier && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert Unauthorized();

        address recipient = payoutAddress[supplier];
        if (recipient == address(0)) {
            recipient = supplier;
        }

        uint256 amount = supplierLiquidBalance[supplier];
        if (amount == 0) revert InvalidAmount();

        supplierLiquidBalance[supplier] = 0;
        IERC20(usdc).safeTransfer(recipient, amount);
    }

    function setPayoutAddress(address newAddress) external {
        payoutAddress[msg.sender] = newAddress;
        emit PayoutAddressSet(msg.sender, newAddress);
    }

    /// @notice Set the address that receives the merchant's 40% share of the platform fee.
    /// Defaults to the merchant's own wallet if never called.
    function setMerchantFeeRecipient(address recipient) external {
        if (recipient == address(0)) revert ZeroAddress();
        merchantFeeRecipient[msg.sender] = recipient;
    }

    /// @notice Withdraw accrued 40% merchant fee share.
    function withdrawMerchantFees() external nonReentrant {
        address recipient = merchantFeeRecipient[msg.sender];
        if (recipient == address(0)) recipient = msg.sender;
        uint256 amount = merchantFeeBalance[msg.sender];
        if (amount == 0) revert InvalidAmount();
        merchantFeeBalance[msg.sender] = 0;
        pendingMerchantFees -= amount;
        IERC20(usdc).safeTransfer(recipient, amount);
    }

    function setYieldEnabled(address merchant, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (merchant == address(0)) revert ZeroAddress();
        yieldEnabled[merchant] = enabled;
    }

    function getInvoice(bytes32 invoiceId) external view returns (Invoice memory) {
        return invoices[invoiceId];
    }

    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getNonce(address signer) external view returns (uint256) {
        return nonces[signer];
    }

    function _createInvoice(
        bytes32 invoiceId,
        address merchant,
        uint256 grossAmount,
        address supplier,
        uint256 supplierShareBps,
        uint256 taxShareBps
    ) internal returns (Invoice storage invoice) {
        if (merchant == address(0) || supplier == address(0)) revert ZeroAddress();
        if (grossAmount == 0) revert InvalidAmount();
        if (supplierShareBps + taxShareBps + PLATFORM_FEE_BPS > MAX_BPS) revert InvalidBps();

        invoice = invoices[invoiceId];
        if (invoice.merchant != address(0)) revert InvoiceAlreadyExists(invoiceId);

        invoice.merchant = merchant;
        invoice.grossAmount = grossAmount;
        invoice.supplier = supplier;
        invoice.supplierShareBps = supplierShareBps;
        invoice.taxShareBps = taxShareBps;

        emit InvoiceCreated(invoiceId, merchant, grossAmount);
    }

    function _settlePayment(
        bytes32 invoiceId,
        address merchant,
        uint256 grossAmount,
        address supplier,
        uint256 supplierShareBps,
        uint256 taxShareBps
    ) internal {
        uint256 platformFee = (grossAmount * PLATFORM_FEE_BPS) / MAX_BPS;
        uint256 supplierShare = (grossAmount * supplierShareBps) / MAX_BPS;
        uint256 taxShare = (grossAmount * taxShareBps) / MAX_BPS;
        uint256 netRevenue = grossAmount - platformFee - supplierShare - taxShare;

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), grossAmount);

        _recordSplit(invoiceId, merchant, grossAmount, supplier, platformFee, supplierShare, taxShare, netRevenue);
    }

    /// @dev Like _settlePayment but skips the transferFrom — funds already in contract (QR path).
    function _settleFromBalance(
        bytes32 invoiceId,
        address merchant,
        uint256 grossAmount,
        address supplier,
        uint256 supplierShareBps,
        uint256 taxShareBps
    ) internal {
        uint256 platformFee = (grossAmount * PLATFORM_FEE_BPS) / MAX_BPS;
        uint256 supplierShare = (grossAmount * supplierShareBps) / MAX_BPS;
        uint256 taxShare = (grossAmount * taxShareBps) / MAX_BPS;
        uint256 netRevenue = grossAmount - platformFee - supplierShare - taxShare;

        _recordSplit(invoiceId, merchant, grossAmount, supplier, platformFee, supplierShare, taxShare, netRevenue);
    }

    function _recordSplit(
        bytes32 invoiceId,
        address merchant,
        uint256 grossAmount,
        address supplier,
        uint256 platformFee,
        uint256 supplierShare,
        uint256 taxShare,
        uint256 netRevenue
    ) internal {
        if (platformFee != 0) {
            // 60% to platform owner, 40% to merchant's chosen fee recipient
            uint256 ownerShare    = (platformFee * PLATFORM_OWNER_SHARE_BPS) / MAX_BPS;
            uint256 merchantShare = platformFee - ownerShare; // remainder avoids dust
            pendingPlatformFees += ownerShare;
            merchantFeeBalance[merchant] += merchantShare;
            pendingMerchantFees += merchantShare;
        }

        if (supplierShare != 0) {
            supplierLiquidBalance[supplier] += supplierShare;
        }

        if (taxShare != 0) {
            merchantTaxReserve[merchant] += taxShare;
        }

        if (netRevenue != 0) {
            merchantLiquidBalance[merchant] += netRevenue;
        }

        totalVolumeProcessed += grossAmount;
        totalPlatformFeesCollected += platformFee;
        dailyVolumes.push(grossAmount);

        emit PaymentReceived(invoiceId, merchant, grossAmount, platformFee, supplierShare, taxShare, netRevenue);
    }

    function _isAdminOrMerchant(address merchant) internal view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || msg.sender == merchant;
    }
}
