//D:\Coding\Project\scripts\deploy.js

const { ethers, run, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("════════════════════════════════════════");
  console.log("  ChainSave — Deploy to", network.name.toUpperCase());
  console.log("════════════════════════════════════════");
  console.log("Deployer :", deployer.address);
  console.log("Balance  :", ethers.formatEther(balance), "ETH");

  if (network.name === "sepolia" && balance < ethers.parseEther("0.05")) {
    console.warn("\n⚠️  Balance thấp! Cần ít nhất 0.05 ETH Sepolia để deploy.");
    console.warn("   Faucet: https://sepoliafaucet.com\n");
  }

  const USDC = (n) => ethers.parseUnits(String(n), 6);

  // 1. MockUSDC
  console.log("\n[1/4] Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log("   ✓ MockUSDC:", usdcAddr);

  // 2. VaultManager
  console.log("\n[2/4] Deploying VaultManager...");
  const VaultManager = await ethers.getContractFactory("VaultManager");
  const vault = await VaultManager.deploy(usdcAddr, deployer.address);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("   ✓ VaultManager:", vaultAddr);

  // 3. SavingCore
  console.log("\n[3/4] Deploying SavingCore...");
  const SavingCore = await ethers.getContractFactory("SavingCore");
  const core = await SavingCore.deploy(usdcAddr, vaultAddr);
  await core.waitForDeployment();
  const coreAddr = await core.getAddress();
  console.log("   ✓ SavingCore:", coreAddr);

  // 4. Setup
  console.log("\n[4/4] Setting up...");
  await (await vault.setSavingCore(coreAddr)).wait();
  await (await usdc.mint(deployer.address, USDC(1_000_000))).wait();
  await (await usdc.approve(vaultAddr, USDC(500_000))).wait();
  await (await vault.fundVault(USDC(500_000))).wait();
  console.log("   ✓ Vault funded: 500,000 USDC");

  const H = (h) => h * 3600;           // giờ → giây
  const D = (d) => d * 86400;          // ngày → giây

  await (await core.createPlan(H(1),  200,  0, 0, 300)).wait(); // 1 giờ,   2% APR
  await (await core.createPlan(H(12), 300,  0, 0, 400)).wait(); // 12 giờ,  3% APR
  await (await core.createPlan(D(7),  350,  0, 0, 400)).wait(); // 7 ngày,  3.5% APR
  await (await core.createPlan(D(30), 500,  0, 0, 500)).wait(); // 30 ngày, 5% APR
  await (await core.createPlan(D(90), 700,  0, 0, 500)).wait(); // 90 ngày, 7% APR
  await (await core.createPlan(D(365),1000, 0, 0, 500)).wait(); // 1 năm,   10% APR
  console.log("   ✓ 6 saving plans created (1h, 12h, 7d, 30d, 90d, 365d)");

  console.log("\n════════════════════════════════════════");
  console.log("  Deployment Complete!");
  console.log("════════════════════════════════════════");
  console.log("MockUSDC    :", usdcAddr);
  console.log("VaultManager:", vaultAddr);
  console.log("SavingCore  :", coreAddr);

  if (network.name === "sepolia") {
    console.log("\n🔗 Etherscan:");
    console.log(`   https://sepolia.etherscan.io/address/${usdcAddr}`);
    console.log(`   https://sepolia.etherscan.io/address/${vaultAddr}`);
    console.log(`   https://sepolia.etherscan.io/address/${coreAddr}`);
  }

  // Auto-update frontend addresses
  const fs = require("fs");
  const contractsPath = "./frontend/src/contracts.js";
  if (fs.existsSync(contractsPath)) {
    let content = fs.readFileSync(contractsPath, "utf8");
    content = content
      .replace(/MockUSDC:\s*"[^"]*"/, `MockUSDC:    "${usdcAddr}"`)
      .replace(/VaultManager:\s*"[^"]*"/, `VaultManager:"${vaultAddr}"`)
      .replace(/SavingCore:\s*"[^"]*"/, `SavingCore:  "${coreAddr}"`);
    fs.writeFileSync(contractsPath, content);
    console.log("\n✅ frontend/src/contracts.js updated automatically!");
  }

  // Verify on Etherscan
  if (network.name === "sepolia" && process.env.ETHERSCAN_API_KEY) {
    console.log("\n⏳ Waiting 30s before verifying on Etherscan...");
    await new Promise((r) => setTimeout(r, 30_000));
    try {
      await run("verify:verify", { address: usdcAddr, constructorArguments: [] });
      await run("verify:verify", { address: vaultAddr, constructorArguments: [usdcAddr, deployer.address] });
      await run("verify:verify", { address: coreAddr, constructorArguments: [usdcAddr, vaultAddr] });
      console.log("✅ All contracts verified on Etherscan!");
    } catch (e) {
      console.log("Verify error:", e.message);
    }
  } else if (network.name === "sepolia") {
    console.log("\n💡 Để verify contract thủ công:");
    console.log(`   npx hardhat verify --network sepolia ${usdcAddr}`);
    console.log(`   npx hardhat verify --network sepolia ${vaultAddr} "${usdcAddr}" "${deployer.address}"`);
    console.log(`   npx hardhat verify --network sepolia ${coreAddr} "${usdcAddr}" "${vaultAddr}"`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
