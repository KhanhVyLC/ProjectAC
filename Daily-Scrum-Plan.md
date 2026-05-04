# Blockchain Final Project — Kế Hoạch Scrum 4 Ngày
# ChainSave — Blockchain Term Deposit System

## Thông tin dự án
- **Framework**: Hardhat + ethers.js
- **Ngôn ngữ contract**: Solidity 0.8.26
- **Token test**: MockUSDC (ERC20, 6 decimals)
- **Frontend**: React + Vite + ethers.js
- **Thư viện**: OpenZeppelin v5 (ERC721, Ownable, Pausable, SafeERC20)
- **Testnet**: Sepolia (Chain ID: 11155111)
- **RPC Provider**: Infura
- **Block Explorer**: Etherscan (sepolia.etherscan.io)

## Cấu hình hardhat.config.js
```js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY   = process.env.PRIVATE_KEY       || "0x" + "0".repeat(64);
const INFURA_ID     = process.env.INFURA_PROJECT_ID  || "";
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY  || "";

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun"   // bắt buộc cho OpenZeppelin v5 (dùng opcode mcopy)
    }
  },
  networks: {
    hardhat: {},
    localhost: { url: "http://127.0.0.1:8545" },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_ID}`,
      accounts: [PRIVATE_KEY],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_KEY,   // Etherscan v2
  },
};
```

## File .env cần có
```
PRIVATE_KEY=0xyour_private_key_here
INFURA_PROJECT_ID=your_infura_project_id
ETHERSCAN_API_KEY=your_etherscan_api_key
```

## Lệnh chạy chương trình
```bash
# Cài dependencies
npm install

# Compile contracts
npx hardhat compile

# Chạy test (localhost, không tốn ETH)
npx hardhat test

# Xem coverage
npx hardhat coverage

# Deploy lên Sepolia
npm run deploy:sepolia

# Chạy frontend
cd frontend && npm install && npm run dev
```

---

## Ngày 1 — Đọc và phân tích yêu cầu nghiệp vụ - Set up project - Viết smart contracts cơ bản

### Mục tiêu
3 file contract compile không lỗi, deploy được trên localhost và Sepolia, Admin quản lý được plan và vault.

### Kiến trúc hệ thống
```
MockUSDC.sol      — ERC20 token test (6 decimals, mintable)
VaultManager.sol  — Giữ pool lãi suất, quản lý feeReceiver, pause
SavingCore.sol    — Quản lý plan, deposit NFT (ERC721), toàn bộ logic user
```

### Luồng tiền
```
User approve → openDeposit → SavingCore giữ gốc
                                     ↓ đáo hạn
                              VaultManager trả lãi
                              SavingCore trả gốc
```

### Tasks
- [x] Khởi tạo Hardhat project: `npm init -y && npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox`
- [x] Cài OpenZeppelin: `npm install @openzeppelin/contracts`
- [x] Tạo `hardhat.config.js` — Solidity 0.8.26, evmVersion cancun, Sepolia + Infura, Etherscan v2
- [x] Tạo `.env` từ `.env.example`, điền `PRIVATE_KEY`, `INFURA_PROJECT_ID`, `ETHERSCAN_API_KEY`
- [x] Viết `MockUSDC.sol` — kế thừa ERC20 + Ownable, override decimals() = 6, hàm mint onlyOwner
- [x] Viết `VaultManager.sol`:
  - `fundVault(amount)` — admin nạp token vào pool lãi
  - `withdrawVault(amount)` — admin rút token từ pool
  - `setFeeReceiver(address)` — đổi địa chỉ nhận penalty
  - `payInterest(to, amount)` — chỉ SavingCore gọi được (onlySavingCore)
  - `forwardPenalty(amount)` — forward penalty đến feeReceiver
  - `pause()` / `unpause()` — onlyOwner
- [x] Viết `SavingCore.sol` — struct và state:
  - Struct `SavingPlan`: tenorDays, aprBps, minDeposit, maxDeposit, earlyWithdrawPenaltyBps, enabled
  - Struct `DepositCert`: planId, principal, aprBpsAtOpen, penaltyBpsAtOpen, tenorDays, startAt, maturityAt, status
  - Enum `DepositStatus`: Active, Withdrawn, ManualRenewed, AutoRenewed
  - Mapping plans, deposits, counter nextPlanId, nextDepositId
  - Tracking: totalPrincipalLocked, totalInterestOwed
- [x] Viết hàm Admin trong SavingCore:
  - `createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps)`
  - `updatePlan(planId, newAprBps)` — chỉ ảnh hưởng deposit MỚI
  - `enablePlan(planId)` / `disablePlan(planId)`
  - `setWithdrawRateLimit(maxCount, maxAmount)` — giới hạn rút
  - `integrityCheck()` — so sánh actual vs sổ sách
  - `financialSummary()` — dashboard đối soát
  - `vaultSolvencyCheck()` — kiểm tra vault đủ lãi không
- [x] Viết hàm User trong SavingCore:
  - `openDeposit(planId, amount)` — snapshot APR+penalty, mint NFT, cộng totalPrincipalLocked
  - `withdrawAtMaturity(depositId)` — trả gốc + lãi từ vault, graceful nếu vault thiếu
  - `earlyWithdraw(depositId)` — trả gốc - penalty, penalty thẳng đến feeReceiver (không qua vault)
- [x] Khai báo đủ events:
  - `PlanCreated(planId, tenorDays, aprBps)`
  - `PlanUpdated(planId, newAprBps)`
  - `DepositOpened(depositId, owner, planId, principal, maturityAt, aprBpsAtOpen)`
  - `Withdrawn(depositId, owner, principal, interest, isEarly)`
  - `Renewed(oldDepositId, newDepositId, newPrincipal, newPlanId)`
  - `InterestShortfall(depositId, owner, principal, interestOwed, interestPaid)`
  - `PenaltyCollected(depositId, receiver, amount)`
- [x] Viết `scripts/deploy.js` — deploy 3 contract, link VaultManager↔SavingCore, fund vault, tạo 5 plan, auto-update frontend/src/contracts.js
- [x] Compile: `npx hardhat compile` — không lỗi
- [x] Deploy localhost: `npx hardhat node` + `npm run deploy:local`
- [x] Deploy Sepolia: `npm run deploy:sepolia` — copy địa chỉ 3 contract
- [x] Verify trên Etherscan

### Lưu ý quan trọng
> **Snapshot APR**: Khi `openDeposit`, copy `plan.aprBps` vào `cert.aprBpsAtOpen` ngay lập tức. Admin đổi plan sau không ảnh hưởng deposit cũ.

> **Precision**: Luôn tính `(principal × aprBps × tenorSeconds) / (365 × 86400 × 10000)` — nhân trước, chia sau.

> **Penalty bypass vault**: `earlyWithdraw` gửi penalty thẳng `safeTransfer(feeReceiver, penalty)` — tránh bị block khi vault paused.

> **evmVersion cancun**: Bắt buộc vì OpenZeppelin v5 dùng opcode `mcopy` chỉ có từ Cancun hard fork.

> Ví dụ tính lãi: 1000 USDC × 250 bps × 90 ngày = `(1_000_000_000 × 250 × 7_776_000) / (31_536_000 × 10_000)` ≈ 6,164,383 units ≈ 6.16 USDC

---

## Ngày 2 — Hoàn thành logic gia hạn SavingCore.sol + Viết test

### Mục tiêu
Manual renew và auto renew đúng, test coverage >90%.

### Tasks

#### SavingCore.sol — Renew functions
- [x] `renewDeposit(depositId, newPlanId)` — whenNotPaused:
  - Active, ownerOf, timestamp >= maturityAt, newPlan enabled
  - Tính interest, vault.payInterest(address(this), interest)
  - newPrincipal = oldPrincipal + interest
  - Status cũ = ManualRenewed
  - Mint NFT mới với APR snapshot từ newPlan hiện tại
  - Emit Renewed
- [x] `autoRenewDeposit(depositId)` — whenNotPaused, **bất kỳ ai gọi được**:
  - Active, timestamp >= maturityAt + GRACE_PERIOD
  - Tính interest với `cert.aprBpsAtOpen CŨ` (bảo vệ user)
  - vault.payInterest(address(this), interest)
  - newPrincipal = oldPrincipal + interest
  - Status cũ = AutoRenewed
  - Mint NFT mới cho owner cũ — cùng planId, tenorDays, APR CŨ
  - Emit Renewed

#### scripts/autoRenewBot.js
- [x] Chạy batch job lúc BATCH_HOUR:BATCH_MINUTE mỗi ngày (default 0h00)
- [x] Quét tất cả DepositOpened events, phân loại: cần renew / chưa đủ / inactive
- [x] Gọi autoRenewDeposit() cho từng deposit đủ điều kiện
- [x] Log chi tiết: depositId, owner, principal, APR, tx hash
- [x] Lịch sử 1 ngày, countdown đến batch tiếp theo
- [x] 1 deposit fail không dừng cả batch
- [x] Chạy bằng: `npm run bot:sepolia`

#### Test — SavingSystem.test.js (>90% coverage)
- [x] **createPlan**: hợp lệ, APR=0 revert, non-owner revert, emit event
- [x] **updatePlan/enable/disable**: emit event, snapshot không đổi
- [x] **openDeposit**: happy path, dưới min, trên max, disabled, zero amount, APR snapshot đúng
- [x] **withdrawAtMaturity**: lãi đúng công thức, trước maturity revert, 2 lần revert, non-owner revert, vault thiếu → graceful + emit InterestShortfall
- [x] **earlyWithdraw**: penalty đúng, lãi=0, penalty → feeReceiver, sau maturity revert, 2 lần revert
- [x] **renewDeposit**: newPrincipal đúng, ManualRenewed, APR mới đúng, trước maturity revert, plan disabled revert
- [x] **autoRenewDeposit**: trước grace revert, sau grace pass, APR lock, NFT → owner cũ, emit Renewed
- [x] **Vault**: fundVault, withdrawVault, rút quá revert, non-owner revert
- [x] **Pause**: tất cả user action bị chặn, unpause hoạt động, vault pause blocks payInterest
- [x] **integrityCheck**: intact=true khi đúng, intact=false khi bị drain (impersonateAccount)
- [x] **vaultSolvencyCheck**: sufficient=true/false, shortfall đúng
- [x] **financialSummary**: principalLocked, interestOwed, isSolvent đúng
- [x] **InterestShortfall**: vault=0 → emit event + nhận đủ gốc
- [x] **PenaltyCollected**: emit đúng receiver + amount
- [x] **totalPrincipalLocked**: tăng khi open, giảm khi withdraw
- [x] **Interest math**: Alice ~6.16 USDC, precision cho số nhỏ
- [x] **Full security flow**: integrity fail → pause → user bị chặn → unpause
- [x] `npx hardhat coverage` → **>90%**

### Lưu ý quan trọng

> **APR lock**: gọi `updatePlan` hạ APR TRƯỚC `autoRenewDeposit`, verify `newCert.aprBpsAtOpen === originalApr`.

---
## Ngày 3 — Frontend React

### Mục tiêu
React app kết nối MetaMask Sepolia, đủ chức năng Depositor + Admin, giao diện hoàn chỉnh.

### Tasks

#### Setup
- [x] `npm create vite@latest frontend -- --template react`
- [x] `cd frontend && npm install ethers`
- [x] Tạo `frontend/src/contracts.js` — địa chỉ 3 contract + ABI đầy đủ
- [x] Đặt file PNG icon vào `frontend/public/`

#### contracts.js — ABI cần có đủ
```js
// ERC20_ABI: balanceOf, approve, allowance, decimals
// VAULT_ABI: vaultBalance, feeReceiver, fundVault, withdrawVault,
//            setFeeReceiver, pause, unpause, paused, owner
// CORE_ABI:  nextPlanId, nextDepositId, getPlan, getDeposit, ownerOf, calcInterest,
//            openDeposit, withdrawAtMaturity, earlyWithdraw,
//            renewDeposit, autoRenewDeposit,
//            createPlan, updatePlan, enablePlan, disablePlan,
//            pause, unpause, paused, owner,
//            integrityCheck, financialSummary, vaultSolvencyCheck,
//            totalPrincipalLocked, totalInterestOwed,
//            events: DepositOpened, Withdrawn, Renewed, InterestShortfall
```

#### Chức năng Depositor
- [x] Connect/Disconnect wallet — đầy đủ địa chỉ (monospace)
- [x] Tab Saving Plans — load qua nextPlanId, tenor/APR/min/max/penalty, nút Mở Deposit
- [x] Modal Mở Deposit — nhập số tiền, lãi dự kiến, approve → openDeposit
- [x] Tab My Deposits — load qua event filter `DepositOpened(null, account)`
- [x] Nút theo trạng thái deposit:
  - Trước maturity:  Rút sớm (confirm dialog thông báo penalty)
  - Trong grace period (0-3 ngày):  Rút + Lãi,  Gia hạn thủ công
  - Sau grace period (>3 ngày):  Rút + Lãi,  Trigger Auto Renew
- [x] Modal Gia hạn — chọn plan mới từ danh sách enabled
- [x] Confirm Auto Renew — dialog thông báo APR cũ được giữ
- [x] Khi paused — tất cả nút disable, banner đỏ "⏸ Hệ thống đang tạm dừng"
- [x] Auto reload khi đổi account MetaMask
- [x] Poll pause state mỗi 5 giây

#### Chức năng Admin
- [x] Badge ADMIN vàng + badge ⏸ PAUSED đỏ ở header
- [x] Tab Admin — menu 9 card (1 màu border, icon PNG màu trắng):
  -  Tạo Plan mới → createPlan
  -  Cập nhật APR → updatePlan
  -  Bật/Tắt Plan → enable/disablePlan + bảng danh sách
  -  Quản lý Vault → fundVault/withdrawVault + dashboard đối soát
  -  Fee Receiver → setFeeReceiver
  -  Pause System → pause/unpause + trạng thái real-time
  -  Phát USDC → mint cho địa chỉ bất kỳ + mint cho chính mình + lịch sử
  -  Xem Plans → bảng tất cả plans
  -  Security Monitor → integrity check + vault solvency + refresh
- [x] Vault Dashboard — coverage % (progress bar xanh/đỏ), cảnh báo thiếu lãi
- [x] Security Monitor — so sánh actual vs sổ sách, cảnh báo đỏ nếu lệch

#### UX & Kỹ thuật
- [x] **Fix input mất focus** — định nghĩa AField, AdminCard, AdminPanel, VaultSolvency, SecurityMonitor **bên ngoài** AdminTab, không lồng function
- [x] **ethers v6** — dùng index `p[0]`, `p[1]` đọc struct, không dùng named fields
- [x] **Load deposits qua events** — `core.filters.DepositOpened(null, account)`
- [x] **Toast notifications** — thành công xanh / thất bại đỏ, tự mất sau 4.5s
- [x] **Error messages tiếng Việt** — decode custom errors rõ ràng
- [x] **Icon PNG trắng** — `filter: "brightness(0) invert(1)"`
- [x] **isPaused** — `Promise.all([vault.paused(), core.paused()])`, setIsPaused instant khi pause/unpause

### Lưu ý quan trọng
> Phải gọi `approve` và chờ tx confirm trước `openDeposit`.

---

## Ngày 4 — Hoàn thiện + Test Sepolia + Nộp bài

### Mục tiêu
Toàn bộ flow hoạt động trên Sepolia, đủ tài liệu, video demo, sẵn sàng nộp.

### Tasks

#### Test flow trên Sepolia
- [ ] Admin: kết nối ví → badge ADMIN hiện
- [ ] Admin: tạo plan → fund vault → mint USDC cho depositor
- [ ] Depositor: kết nối ví → thấy USDC → mở deposit → thấy NFT trong My Deposits
- [ ] Admin: pause → depositor bị chặn → unpause → hoạt động bình thường
- [ ] Security Monitor: integrity check đúng số liệu, vault solvency đúng
- [ ] Bot: `npm run bot:sepolia` → kết nối, in log, countdown đúng

#### NatSpec comments
- [ ] `/// @notice` cho tất cả hàm public/external
- [ ] `/// @param` cho tham số quan trọng
- [ ] `/// @return` cho hàm view
- [ ] `/// @dev` cho công thức lãi, grace period

#### README.md
- [ ] Giới thiệu dự án
- [ ] Kiến trúc: MockUSDC / VaultManager / SavingCore
- [ ] Cài + test + deploy Sepolia
- [ ] Địa chỉ 3 contract + link Etherscan
- [ ] Chạy frontend + bot

#### Kiểm tra repo
- [ ] `git status` — `.env` KHÔNG xuất hiện
- [ ] Không có private key trong code
- [ ] `.gitignore` đầy đủ

#### GitHub
- [ ] Tạo repo public, push code
- [ ] Clone lại thư mục khác, chạy thử từng bước README
- [ ] Repo hiển thị đúng trên GitHub

#### Video demo (3-5 phút)
- [ ] Giới thiệu kiến trúc (30s)
- [ ] Admin: tạo plan → fund vault → mint USDC
- [ ] Depositor: kết nối → xem plan → mở deposit
- [ ] Demo rút đúng hạn (Hardhat local để tua thời gian)
- [ ] Demo rút sớm (hiện penalty)
- [ ] Demo gia hạn thủ công + auto renew
- [ ] Demo Pause → bị chặn → Unpause
- [ ] Security Monitor: integrity check
