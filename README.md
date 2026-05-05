# ChainSave — Blockchain Term Deposit System



  <strong>A decentralized fixed-term savings protocol on Ethereum Sepolia</strong><br/>
  Lock USDC, earn interest, receive an NFT certificate — all on-chain.





## Overview

**ChainSave** is a blockchain-based term deposit system inspired by traditional bank savings products. Users lock MockUSDC tokens for a fixed period (1 hour to 1 year), earn simple interest, and receive an **ERC-721 NFT certificate** as proof of deposit.

Key features:

- **Fixed-term plans** — 6 durations: 1h, 12h, 7d, 30d, 90d, 1y
- **APR snapshot** — interest rate is locked at deposit time, immune to future admin changes
- **Early withdrawal** — allowed with a configurable penalty
- **Manual & auto renewal** — compound interest into a new deposit
- **Admin vault** — separate `VaultManager` holds the interest liquidity pool
- **Pause mechanism** — emergency stop for all user operations
- **Auto-renew bot** — off-chain TypeScript bot renews expired deposits after the grace period

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        User / Admin                      │
└────────────────────────┬────────────────────────────────┘
                         │ MetaMask (ethers.js v6)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    React + Vite Frontend                  │
└───────────┬─────────────────────────┬───────────────────┘
            │                         │
            ▼                         ▼
┌───────────────────┐     ┌───────────────────────────────┐
│    MockUSDC.sol   │     │         SavingCore.sol         │
│  ERC20 · 6 dec   │◄────│  ERC721 · Plans · Deposits    │
│  Mintable (Admin) │     │  openDeposit / withdraw        │
└───────────────────┘     │  renewDeposit / autoRenew      │
                          └───────────────┬───────────────┘
                                          │ payInterest()
                                          ▼
                          ┌───────────────────────────────┐
                          │       VaultManager.sol         │
                          │  Interest pool · feeReceiver   │
                          │  fundVault / withdrawVault     │
                          └───────────────────────────────┘
```

---

## Money Flow

```
User
 │  approve(vaultAddr, amount)
 │  openDeposit(planId, amount)
 ▼
SavingCore ── holds principal (in contract)
              mints NFT to user
                    │
                    │ at maturity
                    ▼
              return principal ──► User
              VaultManager.payInterest() ──► User

Early Withdraw:
  principal - penalty ──► User
  penalty ──────────────► feeReceiver (direct, bypasses vault)
```

---

## Smart Contracts

### `MockUSDC.sol`
ERC-20 token with 6 decimals mimicking real USDC. Only the owner (deployer) can mint.

### `VaultManager.sol`
Holds the interest liquidity pool. Only `SavingCore` can call `payInterest()`. Admin can `fundVault`, `withdrawVault`, change `feeReceiver`, and `pause`/`unpause`.

### `SavingCore.sol`
Core logic contract. Extends ERC-721 — each deposit is an NFT (`SCERT`).

| Function | Description |
|---|---|
| `createPlan(...)` | Admin creates a saving plan |
| `openDeposit(planId, amount)` | User opens a deposit, receives NFT |
| `withdrawAtMaturity(depositId)` | User withdraws principal + interest |
| `earlyWithdraw(depositId)` | User withdraws early with penalty |
| `renewDeposit(depositId, newPlanId)` | User manually renews a matured deposit |
| `autoRenewDeposit(depositId)` | Anyone triggers auto-renewal after grace period |
| `integrityCheck()` | Admin compares actual vs book balances |
| `financialSummary()` | Full reconciliation dashboard |
| `vaultSolvencyCheck()` | Check if vault covers all interest owed |

#### Interest Formula
```
interest = (principal × aprBps × tenorSeconds) / (365 × 86400 × 10_000)
```

> Example: 1,000 USDC × 250 bps × 90 days ≈ **6.16 USDC**

---

## Deployed Addresses

> Network: **Sepolia Testnet** (Chain ID: 11155111)

| Contract | Address |
|---|---|
| MockUSDC | `0x...` |
| VaultManager | `0x...` |
| SavingCore | `0x...` |

🔗 Etherscan:
- MockUSDC: `https://sepolia.etherscan.io/address/0x...`
- VaultManager: `https://sepolia.etherscan.io/address/0x...`
- SavingCore: `https://sepolia.etherscan.io/address/0x...`

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- MetaMask browser extension
- Infura or Alchemy account (for Sepolia RPC)

### Installation

```bash
git clone https://github.com/your-username/chainsave.git
cd chainsave
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
PRIVATE_KEY=0xyour_private_key_here
INFURA_PROJECT_ID=your_infura_project_id
ETHERSCAN_API_KEY=your_etherscan_api_key
```

> ⚠️ Never commit your `.env` file. It is already listed in `.gitignore`.

### Compile Contracts

```bash
npx hardhat compile
```

This generates TypeScript typings in `typechain-types/`.

---

## Running Tests

```bash
# Run all tests
npx hardhat test

# Run with coverage report
npx hardhat coverage
```

Test coverage target: **> 90%**

Coverage includes:

- Plan management (create, update, enable, disable)
- Deposit lifecycle (open, withdraw at maturity, early withdraw)
- Renewal logic (manual renew, auto renew, APR lock)
- Vault operations (fund, withdraw, over-withdraw revert)
- Pause/unpause behavior
- Integrity and solvency checks
- Interest math precision
- Full security flow: integrity fail → pause → block users → unpause

---

## Deployment

### Local (Hardhat Node)

```bash
# Terminal 1 — start local node
npm run node

# Terminal 2 — deploy contracts
npm run deploy:local
```

### Sepolia Testnet

```bash
npm run deploy:sepolia
```

> The script automatically:
> - Deploys all 3 contracts
> - Links `VaultManager` ↔ `SavingCore`
> - Funds the vault with 500,000 USDC
> - Creates 6 saving plans
> - Updates `frontend/src/contracts.js` with new addresses
> - Verifies contracts on Etherscan (if `ETHERSCAN_API_KEY` is set)

---

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser with MetaMask connected to **Sepolia**.

### Depositor Features

- Connect / disconnect MetaMask wallet
- Browse saving plans (tenor, APR, min/max deposit, penalty)
- Open a deposit with live interest preview
- View all personal deposits with real-time status
- Withdraw at maturity, early withdraw, manual renew, trigger auto-renew

### Admin Features

Available when connected with the deployer address:

| Feature | Description |
|---|---|
| Create Plan | Add new saving plans |
| Update APR | Change rate (existing deposits unaffected) |
| Enable / Disable Plan | Toggle plan availability |
| Manage Vault | Fund or withdraw liquidity pool |
| Fee Receiver | Change penalty recipient address |
| Pause System | Emergency stop for all operations |
| Mint USDC | Mint test tokens to any address |
| Security Monitor | Integrity check + vault solvency dashboard |

---

## Auto-Renew Bot

The bot scans all `DepositOpened` and `Renewed` events, identifies deposits past their grace period, and calls `autoRenewDeposit()` on each.

```bash
# Local
npm run bot:local

# Sepolia
npm run bot:sepolia
```

- Runs a batch job daily at **00:00** (configurable)
- One failing deposit does not stop the entire batch
- Detailed logs: deposit ID, owner, principal, APR, tx hash
- Displays countdown to next scheduled run

---

## Directory Structure

```
chainsave/
├── contracts/
│   ├── MockUSDC.sol
│   ├── VaultManager.sol
│   └── SavingCore.sol
├── deploy/
│   └── deploy.ts
├── scripts/
│   └── autoRenewBot.ts
├── test/
│   └── SavingCore.test.ts
├── frontend/
│   ├── public/          # PNG icons + logo
│   └── src/
│       ├── App.jsx
│       ├── contracts.js # Auto-updated by deploy.ts
│       ├── index.css
│       └── main.jsx
├── hardhat.config.ts
├── tsconfig.json
├── .env                 # Not committed
└── .gitignore
```

---

## Security Notes

- **APR Snapshot**: APR is locked at deposit open time — admin changes cannot retroactively affect existing deposits.
- **Penalty bypasses vault**: Early withdrawal penalty is sent directly to `feeReceiver` via `safeTransfer`, ensuring it is never blocked by a vault pause.
- **Grace period shortfall**: If the vault lacks sufficient interest at maturity, the user always receives their full principal; available interest is paid and a `InterestShortfall` event is emitted.
- **Integrity check**: `integrityCheck()` compares the contract's actual token balance against `totalPrincipalLocked` — any mismatch signals a potential exploit.
- **evmVersion cancun**: Required for OpenZeppelin v5 which uses the `mcopy` opcode introduced in the Cancun hard fork.

---

## License

MIT © 2025 — ChainSave
