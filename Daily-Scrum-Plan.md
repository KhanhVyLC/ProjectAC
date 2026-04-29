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
    apiKey: ETHERSCAN_KEY,   // Etherscan v2: dùng 1 key duy nhất
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

## Ngày 2 — Hoàn thành logic gia hạn (smart contract SavingCore.sol) + Viết test

### Mục tiêu
Renew (thủ công + tự động) hoạt động đúng, test coverage >90%, Security Monitor hoạt động.

### Tasks

#### Phần contract
- [x] Viết `renewDeposit(depositId, newPlanId)`:
  - Chỉ cho phép gọi sau `maturityAt`
  - Tính lãi deposit cũ, cộng vào gốc → `newPrincipal`
  - `vault.payInterest(address(this), interest)` để nhận lãi vào contract
  - Đánh dấu deposit cũ `status = ManualRenewed`
  - Mint NFT mới với plan mới (APR snapshot từ plan mới)
  - Emit `Renewed(oldId, newId, newPrincipal, newPlanId)`
- [x] Viết `autoRenewDeposit(depositId)`:
  - Chỉ cho phép gọi sau `maturityAt + 3 days` (grace period)
  - **Giữ nguyên `aprBpsAtOpen` cũ** — không dùng APR hiện tại của plan
  - Giữ nguyên tenor, planId
  - Mint NFT mới cho owner cũ
  - Đánh dấu deposit cũ `status = AutoRenewed`
  - Bất kỳ địa chỉ nào cũng gọi được (bot off-chain trigger)
- [x] Thêm `pause()` / `unpause()` vào SavingCore (chặn tất cả user action)
- [x] Kiểm tra `whenNotPaused` đủ ở: openDeposit, withdrawAtMaturity, earlyWithdraw, renewDeposit, autoRenewDeposit

#### Phần test
- [x] Test `createPlan`: plan hợp lệ, APR = 0 revert, non-owner revert
- [x] Test `updatePlan` / `enablePlan` / `disablePlan`: emit event đúng, chỉ ảnh hưởng deposit mới
- [x] Test `openDeposit`: happy path, dưới min revert, trên max revert, plan disabled revert, snapshot APR đúng
- [x] Test `withdrawAtMaturity`: lãi đúng công thức, rút trước maturity revert, rút 2 lần revert, vault thiếu → graceful shortfall (emit InterestShortfall, vẫn nhận gốc)
- [x] Test `earlyWithdraw`: penalty đúng = principal × penaltyBps / 10000, lãi = 0, penalty đến feeReceiver, rút sau maturity revert
- [x] Test `renewDeposit`: newPrincipal = old + interest, status ManualRenewed, plan mới APR đúng, trước maturity revert
- [x] Test `autoRenewDeposit`: trước grace period revert, sau grace period pass, APR lock (admin hạ APR nhưng deposit vẫn giữ APR cũ), NFT thuộc owner cũ
- [x] Test Vault: fundVault tăng balance, withdrawVault giảm balance, rút quá balance revert
- [x] Test Pause: openDeposit / withdrawAtMaturity / earlyWithdraw / renewDeposit bị chặn khi paused, unpause hoạt động lại
- [x] Test integrityCheck: trả về intact=true khi đúng, intact=false khi bị drain
- [x] Test vaultSolvencyCheck: sufficient=true khi đủ, sufficient=false + shortfall đúng khi thiếu
- [x] Test InterestShortfall: vault = 0 → emit event, user vẫn nhận đủ gốc
- [x] Test PenaltyCollected: earlyWithdraw emit event với đúng receiver và amount
- [x] Chạy `npx hardhat coverage` — đạt >90%

### Lưu ý quan trọng
> Test chạy trên hardhat network (localhost) — không cần Infura, không tốn ETH.

> Dùng `time.increaseTo(timestamp)` hoặc `time.increase(seconds)` từ `@nomicfoundation/hardhat-network-helpers`.

> **APR lock là điểm dễ sai nhất**: test case phải thực hiện `updatePlan` hạ APR TRƯỚC khi `autoRenewDeposit`, sau đó verify `newCert.aprBpsAtOpen === originalApr`.

> `autoRenewDeposit` không cần `onlyOwner` — bất kỳ ai cũng gọi được sau grace period.

> Công thức: `GRACE_PERIOD = 3 days = 259200 seconds` — fast-forward `maturityAt + 259201` để qua grace period.

---
## Ngày 3 — Frontend

### Mục tiêu
React app kết nối MetaMask trên Sepolia, đủ các chức năng

### Tasks
-  Tạo React app (Vite), cài ethers.js, import ABI từ `artifacts/`
-  Cấu hình MetaMask trỏ vào Sepolia testnet
-  Lưu địa chỉ contract đã deploy vào file config (không hardcode trong component)
-  Component `ConnectWallet` — kết nối MetaMask, hiển thị địa chỉ ví
-  Component `PlanList` — hiển thị danh sách saving plans (tenor, APR, min/max)
-  Component `OpenDeposit` — form nhập plan + số tiền, gọi `approve` rồi mới gọi `openDeposit`
-  Component `MyDeposits` — hiển thị NFT deposits của user (status, số tiền, ngày đáo hạn)
-  Nút Rút tiền — tự chọn đúng hạn (`withdrawAtMaturity`) hoặc sớm hạn (`earlyWithdraw`)
-  Nút Gia hạn — chọn plan mới, gọi `renewDeposit`
-  Test toàn bộ flow trên Sepolia với MetaMask



---

## Ngày 4 — Hoàn thiện + Demo + Nộp bài

### Mục tiêu
Đủ tài liệu, repo, sẵn sàng nộp

### Tasks
-  Fix bug còn lại nếu có
-  Thêm NatSpec comments vào các hàm chính (`/// @notice`, `@param`, `@return`)
-  Viết `README.md` gồm: cách cài, chạy test, deploy Sepolia, link contract trên Etherscan, cách chạy frontend
-  Kiểm tra `.gitignore` có đủ: `.env`, `node_modules/`, `artifacts/`, `cache/`, `coverage/`
-  Quay video demo 3–5 phút: kết nối ví → xem plan → gửi tiền → rút / gia hạn
-  Push lên GitHub, để repo public
-  Clone lại từ đầu, chạy thử để đảm bảo không thiếu file


---

## Checklist Nộp Bài

-  GitHub repo public
-  Đủ 3 file contract: `MockUSDC.sol`, `VaultManager.sol`, `SavingCore.sol`
-  Contract đã verify trên Sepolia Etherscan
-  Test coverage >90%
-  Frontend chạy được, kết nối Sepolia
-  `README.md` có link contract Etherscan
-  Video demo 3–5 phút
-  `.env` không bị push lên GitHub
