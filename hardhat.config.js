require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY    = process.env.PRIVATE_KEY        || "0x" + "0".repeat(64);
const INFURA_ID      = process.env.INFURA_PROJECT_ID  || "";
const ETHERSCAN_KEY  = process.env.ETHERSCAN_API_KEY  || "";

// Infura RPC endpoint cho Sepolia
const SEPOLIA_RPC = `https://sepolia.infura.io/v3/${INFURA_ID}`;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: { 
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun"
    }
  },
  networks: {
    hardhat: {},
    localhost: { url: "http://127.0.0.1:8545" },
    sepolia: {
      url: SEPOLIA_RPC,
      accounts: [PRIVATE_KEY],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_KEY,  // V2
  },
};