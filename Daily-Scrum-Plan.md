# Blockchain Final Project — 4-Day Scrum Plan
# ChainSave — Blockchain Term Deposit System

## Project Information
- **Framework**: Hardhat + ethers.js
- **Contract Language**: Solidity 0.8.26
- **Script Language**: TypeScript
- **Test Token**: MockUSDC (ERC20, 6 decimals)
- **Frontend**: React + Vite + ethers.js
- **Libraries**: OpenZeppelin v5 (ERC721, Ownable, Pausable, SafeERC20)
- **Testnet**: Sepolia (Chain ID: 11155111)
- **RPC Provider**: Infura
- **Block Explorer**: Etherscan (sepolia.etherscan.io)

## Directory Structure
```
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
│   ├── node_modules/
│   ├── public/
│   │   ├── admin.png
│   │   ├── deposit.png
│   │   ├── ic_create_plan.png
│   │   ├── ic_fee.png
│   │   ├── ic_grace.png
│   │   ├── ic_mint.png
│   │   ├── ic_pause.png
│   │   ├── ic_plans.png
│   │   ├── ic_security.png
│   │   ├── ic_toggle_plan.png
│   │   ├── ic_unpause.png
│   │   ├── ic_update_apr.png
│   │   ├── ic_usdc_coin.png
│   │   ├── ic_vault.png
│   │   ├── ic_vault_coin.png
│   │   ├── logo.png
│   │   └── saving.png
│   ├── src/
│   │   ├── App.jsx
│   │   ├── contracts.js
│   │   ├── index.css
│   │   └── main.jsx
│   ├── .gitignore
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── README.md
│   └── vite.config.js
├── hardhat.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── .env
└── .gitignore
```

## hardhat.config.ts Configuration
```ts
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";

const PRIVATE_KEY   = process.env.PRIVATE_KEY       ?? "0x" + "0".repeat(64);
const INFURA_ID     = process.env.INFURA_PROJECT_ID ?? "";
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",  // required for OpenZeppelin v5 (uses mcopy opcode)
    },
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
    apiKey: ETHERSCAN_KEY,  // Etherscan v2
  },
};

export default config;
```

## Required .env Variables
```
PRIVATE_KEY=0xyour_private_key_here
INFURA_PROJECT_ID=your_infura_project_id
ETHERSCAN_API_KEY=your_etherscan_api_key
```

## Commands
```bash
# Install dependencies
npm install

# Compile contracts (generates typechain-types/)
npx hardhat compile

# Run tests
npx hardhat test

# Check coverage
npx hardhat coverage

# Deploy to localhost (open another terminal and run node first)
npm run node
npm run deploy:local

# Deploy to Sepolia
npm run deploy:sepolia

# Run bot
npm run bot:local
npm run bot:sepolia

# Run frontend
cd frontend && npm install && npm run dev
```

---

## Day 1 — Read & Analyze Business Requirements · Project Setup · Write Basic Smart Contracts

### Goal
3 contract files compile without errors, deploy successfully on localhost and Sepolia, Admin can manage plans and vaults.

### System Architecture
```
MockUSDC.sol      — Test ERC20 token (6 decimals, mintable)
VaultManager.sol  — Holds interest pool, manages feeReceiver, handles pause
SavingCore.sol    — Manages plans, deposit NFTs (ERC721), all user logic
```

### Money Flow
```
User approve → openDeposit → SavingCore holds principal
                                     ↓ at maturity
                              VaultManager pays interest
                              SavingCore returns principal
```

### Tasks
- [x] Initialize Hardhat project: `npm init -y && npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox`
- [x] Install TypeScript: `npm install --save-dev typescript ts-node @types/node`
- [x] Install OpenZeppelin: `npm install @openzeppelin/contracts`
- [x] Create `hardhat.config.ts` — Solidity 0.8.26, evmVersion cancun, Sepolia + Infura, Etherscan v2
- [x] Create `tsconfig.json` and `tsconfig.node.json`
- [x] Create `.env` from `.env.example`, fill in `PRIVATE_KEY`, `INFURA_PROJECT_ID`, `ETHERSCAN_API_KEY`
- [x] Write `MockUSDC.sol` — extends ERC20 + Ownable, override decimals() = 6, mint function onlyOwner
- [x] Write `VaultManager.sol`:
  - `fundVault(amount)` — admin deposits tokens into interest pool
  - `withdrawVault(amount)` — admin withdraws tokens from pool
  - `setFeeReceiver(address)` — change penalty recipient address
  - `payInterest(to, amount)` — only callable by SavingCore (onlySavingCore)
  - `forwardPenalty(amount)` — forward penalty to feeReceiver
  - `pause()` / `unpause()` — onlyOwner
- [x] Write `SavingCore.sol` — structs and state:
  - Struct `SavingPlan`: tenorSeconds, aprBps, minDeposit, maxDeposit, earlyWithdrawPenaltyBps, enabled
  - Struct `DepositCert`: planId, principal, aprBpsAtOpen, penaltyBpsAtOpen, tenorSeconds, startAt, maturityAt, status
  - Enum `DepositStatus`: Active, Withdrawn, ManualRenewed, AutoRenewed
  - Mappings: plans, deposits, counters nextPlanId, nextDepositId
  - Tracking: totalPrincipalLocked, totalInterestOwed
- [x] Write Admin functions in SavingCore:
  - `createPlan(tenorSeconds, aprBps, minDeposit, maxDeposit, penaltyBps)`
  - `updatePlan(planId, newAprBps)` — only affects NEW deposits
  - `enablePlan(planId)` / `disablePlan(planId)`
  - `integrityCheck()` — compare actual vs book balances
  - `financialSummary()` — reconciliation dashboard
  - `vaultSolvencyCheck()` — check if vault has enough interest
- [x] Write User functions in SavingCore:
  - `openDeposit(planId, amount)` — snapshot APR+penalty, mint NFT, add to totalPrincipalLocked
  - `withdrawAtMaturity(depositId)` — return principal + interest from vault, graceful if vault is short
  - `earlyWithdraw(depositId)` — return principal minus penalty, penalty goes directly to feeReceiver (bypasses vault)
- [x] Declare all events:
  - `PlanCreated(planId, tenorSeconds, aprBps)`
  - `PlanUpdated(planId, newAprBps)`
  - `DepositOpened(depositId, owner, planId, principal, maturityAt, aprBpsAtOpen)`
  - `Withdrawn(depositId, owner, principal, interest, isEarly)`
  - `Renewed(oldDepositId, newDepositId, newPrincipal, newPlanId)`
  - `InterestShortfall(depositId, owner, principal, interestOwed, interestPaid)`
  - `PenaltyCollected(depositId, receiver, amount)`
- [x] Write `deploy/deploy.ts` — deploy 3 contracts, link VaultManager↔SavingCore, fund vault, create 6 plans, auto-update frontend/src/contracts.js
- [x] Compile: `npx hardhat compile` — no errors, generates `typechain-types/`
- [x] Deploy to localhost: `npm run node` + `npm run deploy:local`
- [x] Deploy to Sepolia: `npm run deploy:sepolia` — copy addresses of all 3 contracts
- [x] Verify on Etherscan

### Important Notes

> **APR Snapshot**: When `openDeposit` is called, copy `plan.aprBps` into `cert.aprBpsAtOpen` immediately. Admin changing a plan later does not affect existing deposits.

> **Precision**: Always compute `(principal × aprBps × tenorSeconds) / (365 × 86400 × 10000)` — multiply first, divide last.

> **Penalty bypasses vault**: `earlyWithdraw` sends penalty directly via `safeTransfer(feeReceiver, penalty)` — avoids being blocked when vault is paused.

> **evmVersion cancun**: Required because OpenZeppelin v5 uses the `mcopy` opcode only available from the Cancun hard fork.

> Interest calculation example: 1000 USDC × 250 bps × 90 days = `(1_000_000_000 × 250 × 7_776_000) / (31_536_000 × 10_000)` ≈ 6,164,383 units ≈ 6.16 USDC

---

## Day 2 — Complete SavingCore.sol Renewal Logic + Write Tests

### Goal
Manual renew and auto renew work correctly, test coverage >90%.

### Tasks

#### SavingCore.sol — Renew Functions
- [x] `renewDeposit(depositId, newPlanId)` — whenNotPaused:
  - Active, ownerOf, timestamp >= maturityAt, newPlan enabled
  - Calculate interest, vault.payInterest(address(this), interest)
  - newPrincipal = oldPrincipal + interest
  - Old status = ManualRenewed
  - Mint new NFT with APR snapshot from current newPlan
  - Emit Renewed
- [x] `autoRenewDeposit(depositId)` — whenNotPaused, **callable by anyone**:
  - Active, timestamp >= maturityAt + gracePeriod
  - Calculate interest using OLD `cert.aprBpsAtOpen` (protects user)
  - vault.payInterest(address(this), interest)
  - newPrincipal = oldPrincipal + interest
  - Old status = AutoRenewed
  - Mint new NFT for original owner — same planId, tenorSeconds, OLD APR
  - Emit Renewed

#### scripts/autoRenewBot.ts
- [x] Written in TypeScript with full type annotations and interfaces
- [x] Runs a batch job at BATCH_HOUR:BATCH_MINUTE each day (default 00:00)
- [x] Scans all DepositOpened + Renewed events, categorizes: needs renewal / not ready / inactive
- [x] Calls autoRenewDeposit() for each eligible deposit
- [x] Detailed logging: depositId, owner, principal, APR, tx hash
- [x] Batch history and countdown to next run
- [x] One failing deposit does not stop the entire batch
- [x] Run with: `npm run bot:sepolia`

#### test/SavingCore.test.ts (>90% coverage)
- [x] Full type imports from `typechain-types/`
- [x] Define `Fixture` interface for `deployAll()` return type
- [x] **createPlan**: valid case, APR=0 revert, non-owner revert, emit event
- [x] **updatePlan/enable/disable**: emit event, snapshot unchanged
- [x] **openDeposit**: happy path, below min, above max, disabled plan, zero amount, APR snapshot correct
- [x] **withdrawAtMaturity**: interest matches formula, before maturity revert, double withdraw revert, non-owner revert, vault short → graceful + emit InterestShortfall
- [x] **earlyWithdraw**: penalty correct, interest=0, penalty goes to feeReceiver, after maturity revert, double withdraw revert
- [x] **renewDeposit**: newPrincipal correct, ManualRenewed status, new APR correct, before maturity revert, disabled plan revert
- [x] **autoRenewDeposit**: before grace period revert, after grace period passes, APR locked, NFT goes to original owner, emit Renewed
- [x] **Vault**: fundVault, withdrawVault, over-withdraw revert, non-owner revert
- [x] **Pause**: all user actions blocked, unpause works, vault pause blocks payInterest
- [x] **integrityCheck**: intact=true when correct, intact=false when drained (impersonateAccount)
- [x] **vaultSolvencyCheck**: sufficient=true/false, correct shortfall
- [x] **financialSummary**: principalLocked, interestOwed, isSolvent all correct
- [x] **InterestShortfall**: vault=0 → emit event + user receives full principal
- [x] **PenaltyCollected**: emits correct receiver + amount
- [x] **totalPrincipalLocked**: increases on open, decreases on withdraw
- [x] **Interest math**: Alice ~6.16 USDC, precision for small amounts
- [x] **Full security flow**: integrity fail → pause → users blocked → unpause
- [x] `npx hardhat coverage` → **>90%**

---

## Day 3 — React Frontend

### Goal
React app connects to MetaMask on Sepolia, full Depositor + Admin functionality, polished UI.

### Tasks

#### Setup
- [x] `npm create vite@5 frontend -- --template react`
- [x] `cd frontend && npm install ethers`
- [x] Create `frontend/src/contracts.js` — addresses of 3 contracts + full ABI (auto-updated by `deploy.ts`)
- [x] Place PNG icon files in `frontend/public/`

#### contracts.js — Required ABI entries
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

#### Depositor Features
- [x] Connect/Disconnect wallet — full address displayed (monospace)
- [x] Saving Plans tab — load via nextPlanId, show tenor/APR/min/max/penalty, Open Deposit button
- [x] Open Deposit modal — enter amount, preview estimated interest, approve → openDeposit
- [x] My Deposits tab — load via event filter `DepositOpened(null, account)`
- [x] Action buttons based on deposit state:
  - Before maturity: Early Withdraw (confirm dialog showing penalty)
  - Within grace period (0–3 days): Withdraw + Interest · Manual Renew
  - After grace period (>3 days): Withdraw + Interest · Trigger Auto Renew
- [x] Renew modal — choose new plan from enabled plans list
- [x] Confirm Auto Renew — dialog informing user that old APR is preserved
- [x] When paused — all buttons disabled, red banner "⏸ System is currently paused"
- [x] Auto reload on MetaMask account change
- [x] Poll pause state every 5 seconds

#### Admin Features
- [x] Gold ADMIN badge + red ⏸ PAUSED badge in header
- [x] Admin tab — menu of cards (colored border, white PNG icons):
  - Create New Plan → createPlan
  - Update APR → updatePlan
  - Enable/Disable Plan → enable/disablePlan + plan list table
  - Manage Vault → fundVault/withdrawVault + reconciliation dashboard
  - Fee Receiver → setFeeReceiver
  - Pause System → pause/unpause + real-time status
  - Mint USDC → mint to any address + mint to self + history
  - View Plans → full plan table
  - Security Monitor → integrity check + vault solvency + refresh
- [x] Vault Dashboard — coverage % (green/red progress bar), warning if interest is insufficient
- [x] Security Monitor — compare actual vs book values, red alert on mismatch

#### UX & Technical Details
- [x] **Fix input focus loss** — define AField, AdminCard, AdminPanel, VaultSolvency, SecurityMonitor **outside** AdminTab, no nested functions
- [x] **ethers v6** — use index access `p[0]`, `p[1]` to read structs, no named fields
- [x] **Load deposits via events** — `core.filters.DepositOpened(null, account)`
- [x] **Toast notifications** — green for success / red for failure, auto-dismiss after 4.5s
- [x] **Error messages in English** — decode custom errors clearly
- [x] **White PNG icons** — `filter: "brightness(0) invert(1)"`
- [x] **isPaused** — `Promise.all([vault.paused(), core.paused()])`, setIsPaused instantly on pause/unpause

### Important Notes

> Must call `approve` and wait for tx confirmation before calling `openDeposit`.

---

## Day 4 — Finalize + Functional Testing on Sepolia + Submission

### Goal
All flows working on Sepolia, full documentation, demo video, ready to submit.

### Tasks

#### Functional Testing on Sepolia
- [ ] Admin: connect wallet → ADMIN badge appears
- [ ] Admin: create plan → fund vault → mint USDC for depositor
- [ ] Depositor: connect wallet → see USDC balance → open deposit → see NFT in My Deposits
- [ ] Admin: pause → depositor blocked → unpause → system works normally
- [ ] Security Monitor: integrity check shows correct figures, vault solvency is accurate
- [ ] Bot: `npm run bot:sepolia` → connects, prints logs, countdown works correctly

#### NatSpec Comments
- [ ] `/// @notice` for all public/external functions
- [ ] `/// @param` for important parameters
- [ ] `/// @return` for view functions
- [ ] `/// @dev` for interest formula, grace period logic

#### README.md
- [ ] Project introduction
- [ ] Architecture: MockUSDC / VaultManager / SavingCore
- [ ] Install + test + deploy to Sepolia
- [ ] Addresses of all 3 contracts + Etherscan links
- [ ] Run frontend + bot

#### Repository Checklist
- [ ] `git status` — `.env` does NOT appear
- [ ] No private keys in code
- [ ] `.gitignore` is complete

#### GitHub
- [ ] Create public repo, push code
- [ ] Clone into a different directory, follow README step-by-step
- [ ] Repo displays correctly on GitHub

#### Demo Video (3–5 minutes)
- [ ] Architecture overview (30s)
- [ ] Admin: create plan → fund vault → mint USDC
- [ ] Depositor: connect → view plans → open deposit
- [ ] Demo withdraw at maturity (use Hardhat local to fast-forward time)
- [ ] Demo early withdraw (show penalty deduction)
- [ ] Demo manual renew + auto renew
- [ ] Demo Pause → blocked → Unpause
- [ ] Security Monitor: integrity check
