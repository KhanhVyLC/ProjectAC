// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./VaultManager.sol";

/// @title SavingCore
/// @notice Manages saving plans and deposit certificates (ERC721 NFTs).
///         Users lock tokens for a fixed tenor, earn simple interest, and can
///         withdraw, manually renew, or be auto-renewed after the grace period.
contract SavingCore is ERC721, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ─────────────────────── Constants ───────────────────────

    uint256 public constant SECONDS_PER_YEAR = 365 * 24 * 3600;
    uint256 public constant BPS_DENOMINATOR   = 10_000;
    uint256 public constant GRACE_PERIOD_DEFAULT = 3 days;

    /// @notice Grace period có thể thay đổi bởi Admin (default 3 ngày)
    uint256 public gracePeriod = GRACE_PERIOD_DEFAULT;

    // ─────────────────────── Types ───────────────────────

    /// @notice Status of a deposit certificate
    enum DepositStatus { Active, Withdrawn, ManualRenewed, AutoRenewed }

    /// @notice A saving plan created by the admin
    struct SavingPlan {
        uint256 tenorSeconds; ///< Kỳ hạn tính bằng giây (hỗ trợ cả giờ và ngày)
        uint256 aprBps;           // Annual Percentage Rate in basis points
        uint256 minDeposit;       // 0 = no minimum
        uint256 maxDeposit;       // 0 = no maximum
        uint256 earlyWithdrawPenaltyBps;
        bool    enabled;
    }

    /// @notice A deposit certificate (minted as ERC721)
    struct DepositCert {
        uint256 planId;
        uint256 principal;        // tokens locked (smallest unit)
        uint256 aprBpsAtOpen;     // snapshot of APR at open time
        uint256 penaltyBpsAtOpen; // snapshot of penalty at open time
        uint256 tenorSeconds;     // snapshot of tenor at open time (giây)
        uint256 startAt;
        uint256 maturityAt;
        DepositStatus status;
    }

    // ─────────────────────── State ───────────────────────

    IERC20       public immutable token;
    VaultManager public immutable vault;

    uint256 public nextPlanId;
    uint256 public nextDepositId;

    mapping(uint256 => SavingPlan)  public plans;
    mapping(uint256 => DepositCert) public deposits;

    /// @notice Tổng tiền gốc đang khoá trong contract (đối soát)
    uint256 public totalPrincipalLocked;

    /// @notice Tổng lãi phải trả khi tất cả deposit đáo hạn (worst-case)
    uint256 public totalInterestOwed;


    // ─────────────────────── Events ───────────────────────

    event PlanCreated(uint256 indexed planId, uint256 tenorSeconds, uint256 aprBps);
    event PlanUpdated(uint256 indexed planId, uint256 newAprBps);
    event PlanEnabled(uint256 indexed planId);
    event PlanDisabled(uint256 indexed planId);
    event DepositOpened(
        uint256 indexed depositId,
        address indexed owner,
        uint256 indexed planId,
        uint256 principal,
        uint256 maturityAt,
        uint256 aprBpsAtOpen
    );
    event Withdrawn(
        uint256 indexed depositId,
        address indexed owner,
        uint256 principal,
        uint256 interest,
        bool    isEarly
    );
    event Renewed(
        uint256 indexed oldDepositId,
        uint256 indexed newDepositId,
        uint256 newPrincipal,
        uint256 indexed newPlanId
    );

    /// @notice Phát ra khi Admin thay đổi grace period
    event GracePeriodUpdated(uint256 newGracePeriod);

    /// @notice Phát ra khi penalty được chuyển đến feeReceiver
    event PenaltyCollected(uint256 indexed depositId, address indexed receiver, uint256 amount);

    /// @notice Phát ra khi vault không đủ lãi — user vẫn nhận được gốc
    event InterestShortfall(
        uint256 indexed depositId,
        address indexed owner,
        uint256 principal,
        uint256 interestOwed,
        uint256 interestPaid
    );

    /// @notice Phát ra khi Admin force-close một deposit
    event AdminForceClosed(
        uint256 indexed depositId,
        address indexed owner,
        uint256 principal
    );

    // ─────────────────────── Errors ───────────────────────

    error PlanNotFound(uint256 planId);
    error PlanIsDisabled(uint256 planId);
    error AmountBelowMinimum(uint256 amount, uint256 min);
    error AmountAboveMaximum(uint256 amount, uint256 max);
    error DepositNotActive(uint256 depositId);
    error NotDepositOwner(uint256 depositId, address caller);
    error DepositNotMatured(uint256 depositId, uint256 maturityAt, uint256 now_);
    error GracePeriodNotExpired(uint256 depositId, uint256 gracePeriodEnd, uint256 now_);
    error ZeroAmount();
    error InvalidApr();
    error VaultInsufficientForInterest(uint256 available, uint256 required);


    // ─────────────────────── Constructor ───────────────────────

    /// @param _token   ERC20 token address (MockUSDC)
    /// @param _vault   VaultManager address
    constructor(address _token, address _vault)
        ERC721("Saving Certificate", "SCERT")
        Ownable(msg.sender)
    {
        token = IERC20(_token);
        vault = VaultManager(_vault);
    }

    // ─────────────────────── Admin ───────────────────────

    /// @notice Create a new saving plan
    /// @param tenorSeconds             Kỳ hạn tính bằng giây (ví dụ: 3600=1h, 86400=1d, 604800=7d)
    /// @param aprBps                   Annual rate in basis points (e.g. 250 = 2.5%)
    /// @param minDeposit               Minimum deposit amount (0 = none)
    /// @param maxDeposit               Maximum deposit amount (0 = none)
    /// @param earlyWithdrawPenaltyBps  Penalty in bps for early withdrawal
    function createPlan(
        uint256 tenorSeconds,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyOwner {
        if (aprBps == 0) revert InvalidApr();
        uint256 planId = nextPlanId++;
        plans[planId] = SavingPlan({
            tenorSeconds:            tenorSeconds,
            aprBps:                  aprBps,
            minDeposit:              minDeposit,
            maxDeposit:              maxDeposit,
            earlyWithdrawPenaltyBps: earlyWithdrawPenaltyBps,
            enabled:                 true
        });
        emit PlanCreated(planId, tenorSeconds, aprBps);
    }

    /// @notice Update the APR of an existing plan (does not affect open deposits)
    function updatePlan(uint256 planId, uint256 newAprBps) external onlyOwner {
        _requirePlanExists(planId);
        if (newAprBps == 0) revert InvalidApr();
        plans[planId].aprBps = newAprBps;
        emit PlanUpdated(planId, newAprBps);
    }

    /// @notice Enable a plan so users can open new deposits
    function enablePlan(uint256 planId) external onlyOwner {
        _requirePlanExists(planId);
        plans[planId].enabled = true;
        emit PlanEnabled(planId);
    }

    /// @notice Disable a plan — existing deposits are unaffected
    function disablePlan(uint256 planId) external onlyOwner {
        _requirePlanExists(planId);
        plans[planId].enabled = false;
        emit PlanDisabled(planId);
    }

    /// @notice Admin thay đổi grace period (min 1 giây, max 30 ngày)
    /// @param newGracePeriod Thời gian tính bằng giây (ví dụ: 10000, 86400, 259200)
    function setGracePeriod(uint256 newGracePeriod) external onlyOwner {
        require(newGracePeriod > 0,        "Grace period phai lon hon 0");
        require(newGracePeriod <= 30 days, "Grace period qua dai");
        gracePeriod = newGracePeriod;
        emit GracePeriodUpdated(newGracePeriod);
    }

    /// @notice Admin force-close một deposit bất kỳ — chỉ trả gốc, không trả lãi
    /// @dev Dùng để xử lý deposit lỗi (APR sai, vault không đủ, v.v.)
    /// @param depositId Token ID của deposit cần đóng
    function adminForceClose(uint256 depositId) external onlyOwner {
        DepositCert storage cert = deposits[depositId];
        require(cert.status == DepositStatus.Active, "Not active");

        address owner     = ownerOf(depositId);
        uint256 principal = cert.principal;

        uint256 interestWouldOwed = _calcInterest(
            cert.principal,
            cert.aprBpsAtOpen,
            cert.tenorSeconds
        );

        cert.status = DepositStatus.Withdrawn;
        totalPrincipalLocked -= principal;
        if (totalInterestOwed >= interestWouldOwed)
            totalInterestOwed -= interestWouldOwed;

        // Trả gốc về cho owner, không trả lãi
        token.safeTransfer(owner, principal);

        emit AdminForceClosed(depositId, owner, principal);
        emit Withdrawn(depositId, owner, principal, 0, false);
    }

    /// @notice Admin kiểm tra tính toàn vẹn — actual vs sổ sách
    /// @dev Nếu actual < expected thì có thể đã bị hack
    function integrityCheck() external view returns (
        bool isIntact,
        uint256 actual,
        uint256 expected,
        uint256 diff
    ) {
        actual   = token.balanceOf(address(this));
        expected = totalPrincipalLocked;
        isIntact = actual >= expected;
        diff     = isIntact ? 0 : expected - actual;
    }

    /// @notice Emergency pause — all user actions blocked
    function pause() external onlyOwner { _pause(); }

    /// @notice Resume normal operation
    function unpause() external onlyOwner { _unpause(); }

    // ─────────────────────── User flows ───────────────────────

    /// @notice Open a new deposit
    /// @param planId   ID of an enabled saving plan
    /// @param amount   Token amount in smallest unit
    /// @return depositId The minted NFT token ID
    function openDeposit(uint256 planId, uint256 amount)
        external
        whenNotPaused
        returns (uint256 depositId)
    {
        if (amount == 0) revert ZeroAmount();
        SavingPlan storage plan = _requirePlanEnabled(planId);
        if (plan.minDeposit > 0 && amount < plan.minDeposit)
            revert AmountBelowMinimum(amount, plan.minDeposit);
        if (plan.maxDeposit > 0 && amount > plan.maxDeposit)
            revert AmountAboveMaximum(amount, plan.maxDeposit);

        // Transfer principal from user to this contract
        token.safeTransferFrom(msg.sender, address(this), amount);

        // Snapshot plan details and mint NFT
        depositId = nextDepositId++;
        uint256 maturityAt = block.timestamp + plan.tenorSeconds;

        deposits[depositId] = DepositCert({
            planId:           planId,
            principal:        amount,
            aprBpsAtOpen:     plan.aprBps,
            penaltyBpsAtOpen: plan.earlyWithdrawPenaltyBps,
            tenorSeconds:     plan.tenorSeconds,
            startAt:          block.timestamp,
            maturityAt:       maturityAt,
            status:           DepositStatus.Active
        });

        // Track totals for reconciliation
        uint256 interestOwed = _calcInterest(amount, plan.aprBps, plan.tenorSeconds);
        totalPrincipalLocked += amount;
        totalInterestOwed    += interestOwed;

        _safeMint(msg.sender, depositId);

        emit DepositOpened(depositId, msg.sender, planId, amount, maturityAt, plan.aprBps);
    }

    /// @notice Withdraw a matured deposit (principal + interest)
    /// @param depositId The NFT token ID
    function withdrawAtMaturity(uint256 depositId) external whenNotPaused {
        DepositCert storage cert = _requireActiveDeposit(depositId);
        _requireOwner(depositId);

        if (block.timestamp < cert.maturityAt)
            revert DepositNotMatured(depositId, cert.maturityAt, block.timestamp);

        uint256 interest = _calcInterest(
            cert.principal,
            cert.aprBpsAtOpen,
            cert.tenorSeconds
        );

        cert.status = DepositStatus.Withdrawn;

        // Update tracking
        totalPrincipalLocked -= cert.principal;
        totalInterestOwed    -= interest;

        // Return principal — always safe (held in this contract)
        token.safeTransfer(msg.sender, cert.principal);

        // Pay interest from vault — if vault short, pay what's available
        uint256 vaultAvail = vault.vaultBalance();
        if (vaultAvail >= interest) {
            vault.payInterest(msg.sender, interest);
            emit Withdrawn(depositId, msg.sender, cert.principal, interest, false);
        } else {
            // Vault thiếu lãi: trả gốc đủ, trả lãi bao nhiêu có bấy nhiêu
            if (vaultAvail > 0) vault.payInterest(msg.sender, vaultAvail);
            emit InterestShortfall(depositId, msg.sender, cert.principal, interest, vaultAvail);
            emit Withdrawn(depositId, msg.sender, cert.principal, vaultAvail, false);
        }
    }

    /// @notice Withdraw before maturity — zero interest, penalty applied
    /// @param depositId The NFT token ID
    function earlyWithdraw(uint256 depositId) external whenNotPaused {
        DepositCert storage cert = _requireActiveDeposit(depositId);
        _requireOwner(depositId);

        // Must be before maturity to count as early
        require(block.timestamp < cert.maturityAt, "Use withdrawAtMaturity");

        uint256 penalty = (cert.principal * cert.penaltyBpsAtOpen) / BPS_DENOMINATOR;
        uint256 userReceives = cert.principal - penalty;

        cert.status = DepositStatus.Withdrawn;

        // Update tracking (early withdraw: no interest owed)
        uint256 interestWouldOwed = _calcInterest(cert.principal, cert.aprBpsAtOpen, cert.tenorSeconds);
        totalPrincipalLocked -= cert.principal;
        if (totalInterestOwed >= interestWouldOwed)
            totalInterestOwed -= interestWouldOwed;

        // Return principal minus penalty — luôn thành công vì contract đang giữ tiền
        token.safeTransfer(msg.sender, userReceives);

        // Penalty: gửi thẳng đến feeReceiver, không qua vault
        // Tránh bị block nếu vault đang paused hoặc feeReceiver có vấn đề
        if (penalty > 0) {
            address receiver = vault.feeReceiver();
            token.safeTransfer(receiver, penalty);
            emit PenaltyCollected(depositId, receiver, penalty);
        }

        emit Withdrawn(depositId, msg.sender, cert.principal, 0, true);
    }

    /// @notice Manually renew a matured deposit to a (possibly new) plan
    /// @param depositId The NFT token ID of the matured deposit
    /// @param newPlanId The plan to renew into
    /// @return newDepositId The newly minted NFT token ID
    function renewDeposit(uint256 depositId, uint256 newPlanId)
        external
        whenNotPaused
        returns (uint256 newDepositId)
    {
        DepositCert storage cert = _requireActiveDeposit(depositId);
        _requireOwner(depositId);

        if (block.timestamp < cert.maturityAt)
            revert DepositNotMatured(depositId, cert.maturityAt, block.timestamp);

        SavingPlan storage newPlan = _requirePlanEnabled(newPlanId);

        // Calculate interest earned on old deposit and compound into new principal
        uint256 interest = _calcInterest(
            cert.principal,
            cert.aprBpsAtOpen,
            cert.tenorSeconds
        );
        uint256 oldPrincipal = cert.principal;
        uint256 newPrincipal = oldPrincipal + interest;

        // Pay interest from vault (covers the compounding)
        vault.payInterest(address(this), interest);

        // ── FIX: cập nhật tracking trước khi đóng deposit cũ ──────────────
        // Trừ principal + interestOwed của deposit cũ
        totalPrincipalLocked -= oldPrincipal;
        uint256 oldInterestOwed = _calcInterest(oldPrincipal, cert.aprBpsAtOpen, cert.tenorSeconds);
        if (totalInterestOwed >= oldInterestOwed)
            totalInterestOwed -= oldInterestOwed;

        // Mark old deposit as renewed
        cert.status = DepositStatus.ManualRenewed;

        // Mint new deposit NFT
        newDepositId = nextDepositId++;
        uint256 newMaturityAt = block.timestamp + newPlan.tenorSeconds;

        // ── FIX: cộng principal + interestOwed của deposit mới ─────────────
        uint256 newInterestOwed = _calcInterest(newPrincipal, newPlan.aprBps, newPlan.tenorSeconds);
        totalPrincipalLocked += newPrincipal;
        totalInterestOwed    += newInterestOwed;

        deposits[newDepositId] = DepositCert({
            planId:           newPlanId,
            principal:        newPrincipal,
            aprBpsAtOpen:     newPlan.aprBps,
            penaltyBpsAtOpen: newPlan.earlyWithdrawPenaltyBps,
            tenorSeconds:     newPlan.tenorSeconds,
            startAt:          block.timestamp,
            maturityAt:       newMaturityAt,
            status:           DepositStatus.Active
        });

        _safeMint(msg.sender, newDepositId);

        emit Renewed(depositId, newDepositId, newPrincipal, newPlanId);
    }

    /// @notice Trigger auto-renewal for a deposit whose grace period has expired.
    ///         Called by an off-chain bot; anyone can call it.
    /// @param depositId The NFT token ID
    /// @return newDepositId The newly minted NFT token ID
    function autoRenewDeposit(uint256 depositId)
        external
        whenNotPaused
        returns (uint256 newDepositId)
    {
        DepositCert storage cert = _requireActiveDeposit(depositId);

        uint256 gracePeriodEnd = cert.maturityAt + gracePeriod;
        if (block.timestamp < gracePeriodEnd)
            revert GracePeriodNotExpired(depositId, gracePeriodEnd, block.timestamp);

        address owner = ownerOf(depositId);

        uint256 interest = _calcInterest(
            cert.principal,
            cert.aprBpsAtOpen,
            cert.tenorSeconds
        );
        uint256 oldPrincipal = cert.principal;
        uint256 newPrincipal = oldPrincipal + interest;

        vault.payInterest(address(this), interest);

        // ── FIX: Trừ tracking của deposit cũ ──────────────────────────────────
        totalPrincipalLocked -= oldPrincipal;
        uint256 oldInterestOwed = _calcInterest(
            oldPrincipal,
            cert.aprBpsAtOpen,
            cert.tenorSeconds
        );
        if (totalInterestOwed >= oldInterestOwed)
            totalInterestOwed -= oldInterestOwed;

        cert.status = DepositStatus.AutoRenewed;

        newDepositId = nextDepositId++;
        uint256 newMaturityAt = block.timestamp + cert.tenorSeconds;

        // ── FIX: Cộng tracking của deposit mới ────────────────────────────────
        uint256 newInterestOwed = _calcInterest(
            newPrincipal,
            cert.aprBpsAtOpen,   // locked to original APR
            cert.tenorSeconds
        );
        totalPrincipalLocked += newPrincipal;
        totalInterestOwed    += newInterestOwed;

        deposits[newDepositId] = DepositCert({
            planId:           cert.planId,
            principal:        newPrincipal,
            aprBpsAtOpen:     cert.aprBpsAtOpen,
            penaltyBpsAtOpen: cert.penaltyBpsAtOpen,
            tenorSeconds:     cert.tenorSeconds,
            startAt:          block.timestamp,
            maturityAt:       newMaturityAt,
            status:           DepositStatus.Active
        });

        _safeMint(owner, newDepositId);

        emit Renewed(depositId, newDepositId, newPrincipal, cert.planId);
    }

    // ─────────────────────── Views ───────────────────────

    /// @notice Kiểm tra vault có đủ để trả lãi cho tất cả deposit không
    /// @return sufficient  true nếu đủ
    /// @return shortfall   số tiền thiếu (0 nếu đủ)
    function vaultSolvencyCheck() external view returns (bool sufficient, uint256 shortfall) {
        uint256 vaultBal = vault.vaultBalance();
        if (vaultBal >= totalInterestOwed) {
            return (true, 0);
        }
        return (false, totalInterestOwed - vaultBal);
    }

    /// @notice Tổng quan tài chính để Admin đối soát
    function financialSummary() external view returns (
        uint256 principalLocked,
        uint256 interestOwed,
        uint256 vaultBalance,
        bool    isSolvent,
        uint256 shortfall
    ) {
        principalLocked = totalPrincipalLocked;
        interestOwed    = totalInterestOwed;
        vaultBalance    = vault.vaultBalance();
        isSolvent       = vaultBalance >= interestOwed;
        shortfall       = isSolvent ? 0 : interestOwed - vaultBalance;
    }

    /// @notice Calculate the simple interest for a deposit
    /// @param principal    Deposit amount (smallest unit)
    /// @param aprBps       Annual rate in basis points
    /// @param tenorSeconds Duration in seconds
    function calcInterest(uint256 principal, uint256 aprBps, uint256 tenorSeconds)
        external pure returns (uint256)
    {
        return _calcInterest(principal, aprBps, tenorSeconds);
    }

    /// @notice Get full details of a deposit certificate
    function getDeposit(uint256 depositId) external view returns (DepositCert memory) {
        return deposits[depositId];
    }

    /// @notice Get full details of a saving plan
    function getPlan(uint256 planId) external view returns (SavingPlan memory) {
        return plans[planId];
    }

    // ─────────────────────── Internal helpers ───────────────────────

    /// @dev Simple interest: (principal * aprBps * tenorSeconds) / (SECONDS_PER_YEAR * BPS_DENOMINATOR)
    function _calcInterest(
        uint256 principal,
        uint256 aprBps,
        uint256 tenorSeconds
    ) internal pure returns (uint256) {
        return (principal * aprBps * tenorSeconds) / (SECONDS_PER_YEAR * BPS_DENOMINATOR);
    }

    function _requirePlanExists(uint256 planId) internal view {
        if (planId >= nextPlanId) revert PlanNotFound(planId);
    }

    function _requirePlanEnabled(uint256 planId) internal view returns (SavingPlan storage plan) {
        _requirePlanExists(planId);
        plan = plans[planId];
        if (!plan.enabled) revert PlanIsDisabled(planId);
    }

    function _requireActiveDeposit(uint256 depositId) internal view returns (DepositCert storage cert) {
        cert = deposits[depositId];
        if (cert.status != DepositStatus.Active) revert DepositNotActive(depositId);
    }

    function _requireOwner(uint256 depositId) internal view {
        if (ownerOf(depositId) != msg.sender) revert NotDepositOwner(depositId, msg.sender);
    }
}
