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
