//D:\Coding\Project\frontend\src\contracts.js
export const ADDRESSES = {
  MockUSDC:    "0x95Ce0727BEc8bc18E8d75408f33E02612035c7AD",
  VaultManager:"0x69a66669E9cC35102B24C716A122338730cC25f5",
  SavingCore:  "0x9e9a8A661d1F556DC876651b8B2b92CbDceda3fb",
};

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export const VAULT_ABI = [
  "function vaultBalance() view returns (uint256)",
  "function feeReceiver() view returns (address)",
  "function fundVault(uint256 amount)",
  "function withdrawVault(uint256 amount)",
];

export const CORE_ABI = [
  // Views
  "function nextPlanId() view returns (uint256)",
  "function nextDepositId() view returns (uint256)",
  "function getPlan(uint256 planId) view returns (tuple(uint256 tenorSeconds, uint256 aprBps, uint256 minDeposit, uint256 maxDeposit, uint256 earlyWithdrawPenaltyBps, bool enabled))",
  "function getDeposit(uint256 depositId) view returns (tuple(uint256 planId, uint256 principal, uint256 aprBpsAtOpen, uint256 penaltyBpsAtOpen, uint256 tenorSeconds, uint256 startAt, uint256 maturityAt, uint8 status))",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function calcInterest(uint256 principal, uint256 aprBps, uint256 tenorSeconds) pure returns (uint256)",
  // Transactions
  "function openDeposit(uint256 planId, uint256 amount) returns (uint256)",
  "function withdrawAtMaturity(uint256 depositId)",
  "function earlyWithdraw(uint256 depositId)",
  "function renewDeposit(uint256 depositId, uint256 newPlanId) returns (uint256)",
  "function autoRenewDeposit(uint256 depositId) returns (uint256)",
  // Events
  "event DepositOpened(uint256 indexed depositId, address indexed owner, uint256 indexed planId, uint256 principal, uint256 maturityAt, uint256 aprBpsAtOpen)",
  "event Withdrawn(uint256 indexed depositId, address indexed owner, uint256 principal, uint256 interest, bool isEarly)",
  "event Renewed(uint256 indexed oldDepositId, uint256 indexed newDepositId, uint256 newPrincipal, uint256 indexed newPlanId)",
];