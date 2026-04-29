# Blockchain Final Project — Kế Hoạch Scrum 4 Ngày

## Thông tin dự án
- **Framework**: Hardhat + ethers.js
- **Ngôn ngữ contract**: Solidity
- **Token test**: MockUSDC (ERC20, 6 decimals)
- **Frontend**: React + Vite + ethers.js
- **Thư viện**: OpenZeppelin (ERC721, Ownable, Pausable)
- **Testnet**: Sepolia
- **RPC Provider**: Infura
- **Block Explorer**: Etherscan (sepolia.etherscan.io)

## Cấu hình hardhat.config.js
```js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: process.env.INFURA_URL, // https://sepolia.infura.io/v3/YOUR_KEY
      accounts: [process.env.PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
```

## File .env cần có
```
INFURA_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
PRIVATE_KEY=your_wallet_private_key
ETHERSCAN_API_KEY=your_etherscan_api_key
```



## Ngày 1 — Đọc hiểu phân tích yêu cầu nghiệp vụ + Set up Project + Smart Contract cơ bản

### Mục tiêu
3 file contract compile không lỗi, deploy được trên localhost và Sepolia

### Tasks
-  Khởi tạo Hardhat project, cài OpenZeppelin, cấu hình `hardhat.config.js` với Sepolia + Infura
-  Tạo file `.env` với `INFURA_URL`, `PRIVATE_KEY`, `ETHERSCAN_API_KEY`
-  Viết `MockUSDC.sol` — ERC20, 6 decimals, có hàm `mint` để test
-  Viết `VaultManager.sol` — `fundVault`, `withdrawVault`, `setFeeReceiver`, Ownable, Pausable
-  Viết `SavingCore.sol` — struct `Plan`, struct `DepositCertificate`, mapping lưu trữ
-  Viết hàm admin: `createPlan`, `updatePlan`, `enablePlan`, `disablePlan`
-  Viết hàm user: `openDeposit`, `withdrawAtMaturity`, `earlyWithdraw`
-  Khai báo đủ events: `PlanCreated`, `PlanUpdated`, `DepositOpened`, `Withdrawn`, `Renewed`
-  Deploy thử localhost trước, test công thức lãi (1000 USDC × 250 bps × 90 ngày → ~6.16 USDC)
-  Deploy lên Sepolia, verify contract trên Etherscan



---

## Ngày 2 — Logic gia hạn (Smart Contract SavingCore.sol) + Viết test

### Mục tiêu
Renew hoạt động đúng, test coverage >90%

### Tasks
-  Viết `renewDeposit(depositId, newPlanId)` — lãi cộng vào gốc, mint NFT mới, đánh dấu cũ là `ManualRenewed`
-  Viết `autoRenewDeposit(depositId)` — chỉ chạy sau grace period 3 ngày, giữ nguyên APR cũ, đánh dấu cũ là `AutoRenewed`
-  Emit event `Renewed(oldDepositId, newDepositId, newPrincipal, newPlanId)`
-  Test `createPlan`: valid, disabled, invalid APR
-  Test `openDeposit`: happy path, dưới min, trên max, plan bị tắt
-  Test `withdrawAtMaturity`: đúng lãi, rút sớm, rút 2 lần
-  Test `earlyWithdraw`: đúng phạt, không có lãi
-  Test `renewDeposit`: gốc mới đúng, status `ManualRenewed`
-  Test `autoRenew`: trước grace period → revert, sau grace period → pass, APR lock khi admin hạ
-  Test Vault: nạp tiền, rút tiền, revert nếu vault thiếu tiền
-  Test Pause: mọi hành động bị chặn khi paused
-  Chạy `npx hardhat coverage` → đạt >90%

### Lưu ý
> Test chạy trên localhost (hardhat network) — không cần Infura, không tốn ETH.


> Auto renew phải viết test kỹ.

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
