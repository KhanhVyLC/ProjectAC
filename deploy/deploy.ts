import { ethers, run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── Helper: poll until tx confirmed ───────────────────────────────────────
async function waitForTx(hash: string, label: string): Promise<void> {
  process.stdout.write(`   → Waiting for ${label}`);
  while (true) {
    const receipt = await ethers.provider.getTransactionReceipt(hash);
    if (receipt?.blockNumber) {
      console.log(` ✓ (block ${receipt.blockNumber})`);
      return;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 8000));
  }
}

async function main(): Promise<void> {
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

  const USDC = (n: number): bigint => ethers.parseUnits(String(n), 6);

  // ── 1. MockUSDC ──────────────────────────────────────────────────────────
  console.log("\n[1/4] Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  const usdcTxHash = usdc.deploymentTransaction()!.hash;
  console.log("   → Tx sent:", usdcTxHash);
  await waitForTx(usdcTxHash, "MockUSDC");
  const usdcAddr = await usdc.getAddress();
  console.log("   ✓ MockUSDC:", usdcAddr);

  // ── 2. VaultManager ──────────────────────────────────────────────────────
  console.log("\n[2/4] Deploying VaultManager...");
  const VaultManager = await ethers.getContractFactory("VaultManager");
  const vault = await VaultManager.deploy(usdcAddr, deployer.address);
  const vaultTxHash = vault.deploymentTransaction()!.hash;
  console.log("   → Tx sent:", vaultTxHash);
  await waitForTx(vaultTxHash, "VaultManager");
  const vaultAddr = await vault.getAddress();
  console.log("   ✓ VaultManager:", vaultAddr);

  // ── 3. SavingCore ─────────────────────────────────────────────────────────
  console.log("\n[3/4] Deploying SavingCore...");
  const SavingCore = await ethers.getContractFactory("SavingCore");
  const core = await SavingCore.deploy(usdcAddr, vaultAddr);
  const coreTxHash = core.deploymentTransaction()!.hash;
  console.log("   → Tx sent:", coreTxHash);
  await waitForTx(coreTxHash, "SavingCore");
  const coreAddr = await core.getAddress();
  console.log("   ✓ SavingCore:", coreAddr);

  // ── 4. Setup ──────────────────────────────────────────────────────────────
  console.log("\n[4/4] Setting up...");

  const tx1 = await vault.setSavingCore(coreAddr);
  await waitForTx(tx1.hash, "setSavingCore");

  const tx2 = await usdc.mint(deployer.address, USDC(1_000_000));
  await waitForTx(tx2.hash, "mint 1,000,000 USDC");

  const tx3 = await usdc.approve(vaultAddr, USDC(500_000));
  await waitForTx(tx3.hash, "approve 500,000 USDC");

  const tx4 = await vault.fundVault(USDC(500_000));
  await waitForTx(tx4.hash, "fundVault");
  console.log("   ✓ Vault funded: 500,000 USDC");

  const H = (h: number): number => h * 3600;
  const D = (d: number): number => d * 86400;

  const plans: [number, number, number, number, number, string][] = [
    [H(1),   200,  0, 0, 300, "1h   / 2% APR"],
    [H(12),  300,  0, 0, 400, "12h  / 3% APR"],
    [D(7),   350,  0, 0, 400, "7d   / 3.5% APR"],
    [D(30),  500,  0, 0, 500, "30d  / 5% APR"],
    [D(90),  700,  0, 0, 500, "90d  / 7% APR"],
    [D(365), 1000, 0, 0, 500, "365d / 10% APR"],
  ];

  for (const [tenor, apr, minD, maxD, penalty, label] of plans) {
    const tx = await core.createPlan(tenor, apr, minD, maxD, penalty);
    await waitForTx(tx.hash, `createPlan ${label}`);
  }
  console.log("   ✓ 6 saving plans created (1h, 12h, 7d, 30d, 90d, 365d)");

  // ── Summary ───────────────────────────────────────────────────────────────
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

  // ── Auto-update frontend ──────────────────────────────────────────────────
  const contractsPath = path.resolve("./frontend/src/contracts.js");
  if (fs.existsSync(contractsPath)) {
    let content = fs.readFileSync(contractsPath, "utf8");
    content = content
      .replace(/MockUSDC:\s*"[^"]*"/,    `MockUSDC:    "${usdcAddr}"`)
      .replace(/VaultManager:\s*"[^"]*"/, `VaultManager:"${vaultAddr}"`)
      .replace(/SavingCore:\s*"[^"]*"/,   `SavingCore:  "${coreAddr}"`);
    fs.writeFileSync(contractsPath, content);
    console.log("\n✅ frontend/src/contracts.js updated automatically!");
  }

  // ── Verify on Etherscan ───────────────────────────────────────────────────
  if (network.name === "sepolia" && process.env.ETHERSCAN_API_KEY) {
    console.log("\n⏳ Waiting 30s before verifying on Etherscan...");
    await new Promise<void>((r) => setTimeout(r, 30_000));
    try {
      await run("verify:verify", { address: usdcAddr, constructorArguments: [] });
      await run("verify:verify", { address: vaultAddr, constructorArguments: [usdcAddr, deployer.address] });
      await run("verify:verify", { address: coreAddr,  constructorArguments: [usdcAddr, vaultAddr] });
      console.log("✅ All contracts verified on Etherscan!");
    } catch (e: unknown) {
      console.log("Verify error:", (e as Error).message);
    }
  } else if (network.name === "sepolia") {
    console.log("\n💡 Để verify contract thủ công:");
    console.log(`   npx hardhat verify --network sepolia ${usdcAddr}`);
    console.log(`   npx hardhat verify --network sepolia ${vaultAddr} "${usdcAddr}" "${deployer.address}"`);
    console.log(`   npx hardhat verify --network sepolia ${coreAddr} "${usdcAddr}" "${vaultAddr}"`);
  }
}

main().catch((e: Error) => {
  console.error(e);
  process.exit(1);
});
