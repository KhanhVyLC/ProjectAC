# ⛓️ ChainSave — Blockchain Term Deposit System

> **A decentralized fixed-term deposit system built on Blockchain**

ChainSave allows users to deposit assets (MockUSDC) into Saving Plans created by the Admin and earn interest (APR). Each deposit is uniquely represented by an **NFT (ERC721)** that acts as an on-chain certificate of deposit.

---

## 🌟 Features

### 🧑‍💻 For Depositors

| Feature | Description |
|---|---|
| **Open Deposit** | Select a saving plan, lock USDC, and receive an NFT certificate. The APR is snapshotted at the moment of deposit. |
| **Withdraw at Maturity** | Safely withdraw principal and earned interest from the Vault after the term ends. |
| **Early Withdraw** | Withdraw at any time, subject to a penalty fee sent directly to the Fee Receiver. |
| **Manual Renew** | Select a new plan and roll over accumulated interest into the principal for a new term. |
| **Auto Renew** | If the Grace Period passes without withdrawal, the bot automatically renews the deposit at the original APR to protect the user's funds. |

### 👑 For Admins

| Feature | Description |
|---|---|
| **Plan Management** | Create new plans (term, APR, min/max deposit, penalty fee), update APR, enable/disable plans. |
| **Vault Management** | Fund the interest pool, withdraw funds, and monitor the solvency dashboard. |
| **Security & Control** | Emergency Pause/Unpause the entire system, perform data integrity checks. |

---

## 🏗 System Architecture

The system is composed of **4 core components** working closely together:

### 1. 📜 Smart Contracts (Solidity 0.8.26 — OpenZeppelin v5)

| Contract | Role |
|---|---|
| `MockUSDC.sol` | ERC20 token simulating USDC (6 decimals) for testing, with mint functionality for Admin. |
| `VaultManager.sol` | Interest pool treasury — manages the fee receiver address, authorizes interest payouts, and controls the Pause state. |
| `SavingCore.sol` | The heart of the project — manages saving plans, issues NFT certificates (ERC721), and handles all interest/penalty calculation logic. |

### 2. 🖥️ Frontend (React + Vite + ethers.js v6)

- Interacts directly with Smart Contracts via **MetaMask** on the **Sepolia** network.
- Role-based UI: **Admin** view (management dashboard) and **User** view (Deposit, Withdraw, Renew tabs).

### 3. 🤖 Auto-Renew Bot (Node.js/TypeScript)

- A daily batch job that scans on-chain Events.
- Detects deposits that have exceeded the Grace Period and calls `autoRenewDeposit` to safeguard user funds.

### 4. 🌐 Network / Backend

- **Sepolia Testnet** via **Infura** as the RPC provider.

---

## 📂 Project Structure

```
chainsave/
├── contracts/              # Smart contract source code
│   ├── MockUSDC.sol
│   ├── SavingCore.sol
│   └── VaultManager.sol
├── deploy/                 # Deployment script (auto-updates frontend ABI)
│   └── deploy.ts
├── scripts/                # Supporting scripts
│   └── autoRenewBot.ts     # Bot for scanning and auto-renewing deposits
├── test/                   # Smart contract unit tests (>90% coverage)
│   └── SavingCore.test.ts
├── typechain-types/        # Type definitions auto-generated on compile
├── frontend/               # ReactJS web application (Vite)
│   ├── public/             # Images, icons
│   ├── src/
│   │   ├── assets/
│   │   ├── App.css
│   │   ├── App.jsx         # Main UI logic
│   │   ├── contracts.js    # Contract addresses & ABI (auto-generated on deploy)
│   │   ├── index.css       # Styling
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── hardhat.config.ts       # Hardhat config (compiler, Sepolia network, Etherscan)
├── tsconfig.json
├── tsconfig.node.json
├── package.json
├── .env                    # Environment variables (Private key, API Keys) — do not commit
├── .gitignore
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS version recommended)
- [MetaMask Extension](https://metamask.io/)
- [Infura](https://infura.io/) and [Etherscan](https://etherscan.io/) accounts (for API Keys)

---

### Step 1: Install & Configure Environment

Clone the repository and install dependencies:

```bash
git clone <your-repo-url>
cd chainsave
npm install
```

Create a `.env` file at the project root:

```env
PRIVATE_KEY=0xyour_private_key_here
INFURA_PROJECT_ID=your_infura_project_id
ETHERSCAN_API_KEY=your_etherscan_api_key
```

---

### Step 2: Compile & Test Smart Contracts

Compile the contracts (generates the `typechain-types/` directory):

```bash
npx hardhat compile
```

Run unit tests and check coverage:

```bash
npx hardhat test
npx hardhat coverage
```

---

### Step 3: Deploy

**Option A — Localhost (local test environment)**

```bash
# Terminal 1: Start local node
npm run node

# Terminal 2: Deploy
npm run deploy:local
```

**Option B — Sepolia Testnet**

```bash
npm run deploy:sepolia
```

> 💡 The deploy script will automatically initialize base saving plans, fund the Vault, and update `frontend/src/contracts.js` with the latest ABI and contract addresses.

---

### Step 4: Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

Access the app at: **http://localhost:5173**

---

### Step 5: Run the Auto-Renew Bot

```bash
# Local environment
npm run bot:local

# Sepolia Testnet
npm run bot:sepolia
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Smart Contract** | Solidity 0.8.26, Hardhat, TypeScript, ethers.js v6, OpenZeppelin v5 |
| **EVM Version** | Cancun (supports `mcopy` opcode required by OpenZeppelin v5) |
| **Testing & Deployment** | Hardhat, TypeScript, Hardhat Coverage |
| **Frontend** | ReactJS, Vite, CSS |
| **Bot** | Node.js, TypeScript |
| **Infrastructure** | Infura RPC, Etherscan API, Sepolia Testnet |

---

## 📄 License

This project is licensed under the MIT License.
