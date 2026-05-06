# ⛓️ ChainSave — Blockchain Term Deposit System

> **Hệ thống tiền gửi tiết kiệm có kỳ hạn phi tập trung (Term Deposit) trên nền tảng Blockchain**

ChainSave cho phép người dùng gửi tài sản (MockUSDC) vào các gói tiết kiệm (Saving Plans) do Admin tạo ra để nhận lãi suất (APR). Đặc biệt, mỗi khoản tiền gửi được đại diện bằng một **NFT (ERC721)** đóng vai trò như một chứng chỉ tiền gửi on-chain.

---

## 🌟 Tính năng chính

### 🧑‍💻 Dành cho Người dùng (Depositor)

| Tính năng | Mô tả |
|---|---|
| **Gửi tiết kiệm (Open Deposit)** | Chọn gói tiết kiệm, khóa USDC và nhận về một chứng chỉ NFT. APR được chốt (snapshot) ngay tại thời điểm gửi. |
| **Rút tiền đúng hạn (Withdraw at Maturity)** | Rút gốc và nhận lãi suất từ Vault một cách an toàn. |
| **Rút tiền trước hạn (Early Withdraw)** | Rút tiền bất cứ lúc nào, nhưng bị trừ phí phạt (Penalty) chuyển trực tiếp cho Fee Receiver. |
| **Gia hạn thủ công (Manual Renew)** | Chọn gói mới và cộng dồn lãi vào gốc để tiếp tục gửi. |
| **Gia hạn tự động (Auto Renew)** | Nếu quá thời gian ân hạn (Grace Period) mà không rút, hệ thống bot tự động gia hạn với mức APR ban đầu. |

### 👑 Dành cho Quản trị viên (Admin)

| Tính năng | Mô tả |
|---|---|
| **Quản lý Gói (Plan Management)** | Tạo gói mới (kỳ hạn, APR, min/max deposit, phí phạt), cập nhật APR, bật/tắt gói. |
| **Quản lý Vault (Vault Management)** | Nạp tiền trả lãi (Fund Vault), rút tiền, theo dõi dashboard đối soát (Solvency Check). |
| **Bảo mật & Kiểm soát** | Emergency Pause/Unpause toàn bộ hệ thống, kiểm tra tính toàn vẹn dữ liệu (Integrity Check). |

---

## 🏗 Kiến trúc Hệ thống

Hệ thống được chia làm **4 thành phần chính** hoạt động chặt chẽ với nhau:

### 1. 📜 Smart Contracts (Solidity 0.8.26 — OpenZeppelin v5)

| Contract | Vai trò |
|---|---|
| `MockUSDC.sol` | Token ERC20 mô phỏng USDC (6 decimals), tích hợp tính năng mint cho Admin. |
| `VaultManager.sol` | Kho bạc chứa tiền lãi (Interest Pool), quản lý địa chỉ nhận phí phạt và trạng thái Pause. |
| `SavingCore.sol` | Trái tim của dự án — quản lý gói tiết kiệm, phát hành NFT (ERC721), xử lý logic lãi suất/phí phạt. |

### 2. 🖥️ Frontend (React + Vite + ethers.js v6)

- Giao diện tương tác trực tiếp với Smart Contract qua **MetaMask** trên mạng **Sepolia**.
- Phân quyền hiển thị linh hoạt: **Admin** (Dashboard quản trị) và **Người dùng** (Deposit, Withdraw, Renew).

### 3. 🤖 Auto-Renew Bot (Node.js/TypeScript)

- Batch job tự động quét các Events trên chain mỗi ngày.
- Phát hiện khoản gửi quá thời gian ân hạn → gọi `autoRenewDeposit` để bảo vệ lợi ích người dùng.

### 4. 🌐 Backend / Mạng lưới

- Mạng **Sepolia Testnet** thông qua RPC Provider **Infura**.

---

## 📂 Cấu trúc Thư mục

```
chainsave/
├── contracts/              # Mã nguồn Smart Contracts
│   ├── MockUSDC.sol
│   ├── SavingCore.sol
│   └── VaultManager.sol
├── deploy/                 # Script deploy (tự động cập nhật ABI cho frontend)
│   └── deploy.ts
├── scripts/                # Các script hỗ trợ hệ thống
│   └── autoRenewBot.ts     # Bot quét và tự động gia hạn tiết kiệm
├── test/                   # Unit test cho Smart Contracts (>90% coverage)
│   └── SavingCore.test.ts
├── typechain-types/        # Type definitions tự động sinh khi compile
├── frontend/               # Ứng dụng web ReactJS (Vite)
│   ├── public/             # Hình ảnh, icons
│   ├── src/
│   │   ├── assets/
│   │   ├── App.css
│   │   ├── App.jsx         # Logic giao diện chính
│   │   ├── contracts.js    # Địa chỉ Contract & ABI (tự động sinh khi deploy)
│   │   ├── index.css       # Styling
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── hardhat.config.ts       # Cấu hình Hardhat (Compiler, Mạng Sepolia, Etherscan)
├── tsconfig.json
├── tsconfig.node.json
├── package.json
├── .env                    # Biến môi trường (Private key, API Keys) — không commit
├── .gitignore
└── README.md
```

---

## 🚀 Hướng dẫn Cài đặt & Chạy dự án

### Yêu cầu hệ thống

- [Node.js](https://nodejs.org/) (Khuyến nghị bản LTS)
- [MetaMask Extension](https://metamask.io/)
- Tài khoản [Infura](https://infura.io/) và [Etherscan](https://etherscan.io/) (để lấy API Key)

---

### Bước 1: Cài đặt và Cấu hình Môi trường

Clone dự án và cài đặt dependencies:

```bash
git clone <your-repo-url>
cd chainsave
npm install
```

Tạo file `.env` tại thư mục gốc:

```env
PRIVATE_KEY=0xyour_private_key_here
INFURA_PROJECT_ID=your_infura_project_id
ETHERSCAN_API_KEY=your_etherscan_api_key
```

---

### Bước 2: Biên dịch và Test Smart Contract

Compile contract (tạo ra thư mục `typechain-types/`):

```bash
npx hardhat compile
```

Chạy Unit Test và kiểm tra coverage:

```bash
npx hardhat test
npx hardhat coverage
```

---

### Bước 3: Triển khai (Deployment)

**Option A — Localhost (Môi trường test cục bộ)**

```bash
# Terminal 1: Chạy local node
npm run node

# Terminal 2: Deploy
npm run deploy:local
```

**Option B — Sepolia Testnet**

```bash
npm run deploy:sepolia
```

> 💡 Script deploy sẽ tự động khởi tạo các gói plan cơ bản, cấp vốn cho Vault và cập nhật file `frontend/src/contracts.js` với ABI & địa chỉ mới nhất.

---

### Bước 4: Chạy Giao diện người dùng (Frontend)

```bash
cd frontend
npm install
npm run dev
```

Truy cập ứng dụng tại: **http://localhost:5173**

---

### Bước 5: Chạy Bot gia hạn tự động (Auto-Renew Bot)

```bash
# Test trên local
npm run bot:local

# Test trên mạng Sepolia
npm run bot:sepolia
```

---

## 🛠 Công nghệ sử dụng

| Layer | Công nghệ |
|---|---|
| **Smart Contract** | Solidity 0.8.26, Hardhat, ethers.js v6, OpenZeppelin v5 |
| **EVM Version** | Cancun (hỗ trợ Opcode `mcopy` của OpenZeppelin v5) |
| **Frontend** | ReactJS, Vite, CSS |
| **Bot** | Node.js, TypeScript |
| **Hạ tầng** | Infura RPC, Etherscan API, Sepolia Testnet |

---

## 📄 License

This project is licensed under the MIT License.
