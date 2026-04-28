const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// ─── Helpers ───────────────────────────────────────────────────────────────
const USDC = (n) => ethers.parseUnits(String(n), 6); // 1 USDC = 1_000_000
const BPS_DENOM = 10_000n;
const YEAR = 365n * 24n * 3600n;

function calcInterest(principal, aprBps, tenorDays) {
  const tenorSec = BigInt(tenorDays) * 86400n;
  return (BigInt(principal) * BigInt(aprBps) * tenorSec) / (YEAR * BPS_DENOM);
}

// ─── Fixtures ──────────────────────────────────────────────────────────────
async function deployAll() {
  const [owner, alice, bob, feeReceiver, bot] = await ethers.getSigners();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();

  const VaultManager = await ethers.getContractFactory("VaultManager");
  const vault = await VaultManager.deploy(await usdc.getAddress(), feeReceiver.address);

  const SavingCore = await ethers.getContractFactory("SavingCore");
  const core = await SavingCore.deploy(await usdc.getAddress(), await vault.getAddress());

  // Link core → vault
  await vault.setSavingCore(await core.getAddress());

  // Mint tokens
  await usdc.mint(alice.address, USDC(10_000));
  await usdc.mint(bob.address, USDC(10_000));
  await usdc.mint(owner.address, USDC(100_000));

  // Fund vault with ample interest pool
  await usdc.connect(owner).approve(await vault.getAddress(), USDC(50_000));
  await vault.connect(owner).fundVault(USDC(50_000));

  // Approve core to spend alice & bob tokens
  await usdc.connect(alice).approve(await core.getAddress(), USDC(10_000));
  await usdc.connect(bob).approve(await core.getAddress(), USDC(10_000));

  // Default plan: 90 days, 2.5% APR (250 bps), no limits, 5% early penalty
  await core.connect(owner).createPlan(90, 250, 0, 0, 500); // planId = 0

  return { usdc, vault, core, owner, alice, bob, feeReceiver, bot };
}

// ══════════════════════════════════════════════════════════════════════════════
describe("MockUSDC", function () {
  it("has 6 decimals", async () => {
    const { usdc } = await deployAll();
    expect(await usdc.decimals()).to.equal(6);
  });

  it("owner can mint", async () => {
    const { usdc, alice } = await deployAll();
    await usdc.mint(alice.address, USDC(100));
    // alice already has 10_000 from fixture; check balance increased
  });

  it("non-owner cannot mint", async () => {
    const { usdc, alice } = await deployAll();
    await expect(usdc.connect(alice).mint(alice.address, USDC(1))).to.be.reverted;
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("createPlan", function () {
  it("creates a plan with correct fields", async () => {
    const { core } = await deployAll();
    const plan = await core.getPlan(0);
    expect(plan.tenorDays).to.equal(90);
    expect(plan.aprBps).to.equal(250);
    expect(plan.earlyWithdrawPenaltyBps).to.equal(500);
    expect(plan.enabled).to.be.true;
  });

  it("emits PlanCreated", async () => {
    const { core, owner } = await deployAll();
    await expect(core.connect(owner).createPlan(30, 100, 0, 0, 200))
      .to.emit(core, "PlanCreated")
      .withArgs(1, 30, 100);
  });

  it("reverts on zero APR", async () => {
    const { core, owner } = await deployAll();
    await expect(core.connect(owner).createPlan(30, 0, 0, 0, 200)).to.be.reverted;
  });

  it("reverts if non-owner calls createPlan", async () => {
    const { core, alice } = await deployAll();
    await expect(core.connect(alice).createPlan(30, 100, 0, 0, 200)).to.be.reverted;
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("updatePlan / enable / disable", function () {
  it("updatePlan changes APR and emits PlanUpdated", async () => {
    const { core, owner } = await deployAll();
    await expect(core.connect(owner).updatePlan(0, 300))
      .to.emit(core, "PlanUpdated")
      .withArgs(0, 300);
    expect((await core.getPlan(0)).aprBps).to.equal(300);
  });

  it("disablePlan stops new deposits", async () => {
    const { core, owner, alice } = await deployAll();
    await core.connect(owner).disablePlan(0);
    await expect(core.connect(alice).openDeposit(0, USDC(100))).to.be.reverted;
  });

  it("enablePlan re-allows deposits", async () => {
    const { core, owner, alice } = await deployAll();
    await core.connect(owner).disablePlan(0);
    await core.connect(owner).enablePlan(0);
    await expect(core.connect(alice).openDeposit(0, USDC(100))).to.not.be.reverted;
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("openDeposit", function () {
  it("happy path: mints NFT and records deposit", async () => {
    const { core, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    expect(await core.ownerOf(0)).to.equal(alice.address);
    const cert = await core.getDeposit(0);
    expect(cert.principal).to.equal(USDC(1000));
    expect(cert.aprBpsAtOpen).to.equal(250);
    expect(cert.status).to.equal(0); // Active
  });

  it("emits DepositOpened", async () => {
    const { core, alice } = await deployAll();
    const tx = await core.connect(alice).openDeposit(0, USDC(1000));
    await expect(tx).to.emit(core, "DepositOpened");
  });

  it("reverts if plan is disabled", async () => {
    const { core, owner, alice } = await deployAll();
    await core.connect(owner).disablePlan(0);
    await expect(core.connect(alice).openDeposit(0, USDC(1000))).to.be.reverted;
  });

  it("reverts if amount below minimum", async () => {
    const { core, owner, alice } = await deployAll();
    await core.connect(owner).createPlan(30, 200, USDC(500), 0, 100); // planId 1, min=500
    await expect(core.connect(alice).openDeposit(1, USDC(100))).to.be.reverted;
  });

  it("reverts if amount above maximum", async () => {
    const { core, owner, alice } = await deployAll();
    await core.connect(owner).createPlan(30, 200, 0, USDC(500), 100); // max=500
    await expect(core.connect(alice).openDeposit(1, USDC(1000))).to.be.reverted;
  });

  it("reverts on zero amount", async () => {
    const { core, alice } = await deployAll();
    await expect(core.connect(alice).openDeposit(0, 0)).to.be.reverted;
  });

  it("snaps APR: later updatePlan does not affect open deposit", async () => {
    const { core, owner, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    await core.connect(owner).updatePlan(0, 999); // change APR
    const cert = await core.getDeposit(0);
    expect(cert.aprBpsAtOpen).to.equal(250); // still original
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("withdrawAtMaturity", function () {
  it("pays correct principal + interest after maturity", async () => {
    const { core, usdc, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);

    await time.increaseTo(Number(cert.maturityAt));

    const balBefore = await usdc.balanceOf(alice.address);
    await core.connect(alice).withdrawAtMaturity(0);
    const balAfter = await usdc.balanceOf(alice.address);

    const expectedInterest = calcInterest(USDC(1000), 250, 90);
    const received = balAfter - balBefore;
    expect(received).to.equal(USDC(1000) + expectedInterest);
  });

  it("emits Withdrawn with isEarly=false", async () => {
    const { core, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt));
    await expect(core.connect(alice).withdrawAtMaturity(0))
      .to.emit(core, "Withdrawn")
      .withArgs(0, alice.address, USDC(1000), calcInterest(USDC(1000), 250, 90), false);
  });

  it("reverts if called before maturity", async () => {
    const { core, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    await expect(core.connect(alice).withdrawAtMaturity(0)).to.be.reverted;
  });

  it("reverts if called twice (already withdrawn)", async () => {
    const { core, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt));
    await core.connect(alice).withdrawAtMaturity(0);
    await expect(core.connect(alice).withdrawAtMaturity(0)).to.be.reverted;
  });

  it("reverts if vault has insufficient funds", async () => {
    const { core, vault, owner, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt));

    // Drain vault
    const vBal = await vault.vaultBalance();
    await vault.connect(owner).withdrawVault(vBal);

    await expect(core.connect(alice).withdrawAtMaturity(0)).to.be.reverted;
  });

  it("reverts if caller is not the deposit owner", async () => {
    const { core, alice, bob } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt));
    await expect(core.connect(bob).withdrawAtMaturity(0)).to.be.reverted;
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("earlyWithdraw", function () {
  it("pays principal minus penalty, no interest, penalty to feeReceiver", async () => {
    const { core, usdc, alice, feeReceiver } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));

    const aliceBefore = await usdc.balanceOf(alice.address);
    const feeBefore   = await usdc.balanceOf(feeReceiver.address);

    await core.connect(alice).earlyWithdraw(0);

    const aliceAfter = await usdc.balanceOf(alice.address);
    const feeAfter   = await usdc.balanceOf(feeReceiver.address);

    const expectedPenalty = USDC(1000) * 500n / 10000n; // 5%
    expect(aliceAfter - aliceBefore).to.equal(USDC(1000) - expectedPenalty);
    expect(feeAfter - feeBefore).to.equal(expectedPenalty);
  });

  it("emits Withdrawn with isEarly=true and interest=0", async () => {
    const { core, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    await expect(core.connect(alice).earlyWithdraw(0))
      .to.emit(core, "Withdrawn")
      .withArgs(0, alice.address, USDC(1000), 0, true);
  });

  it("cannot early-withdraw after maturity", async () => {
    const { core, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt));
    await expect(core.connect(alice).earlyWithdraw(0)).to.be.revertedWith(
      "Use withdrawAtMaturity"
    );
  });

  it("cannot withdraw twice", async () => {
    const { core, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    await core.connect(alice).earlyWithdraw(0);
    await expect(core.connect(alice).earlyWithdraw(0)).to.be.reverted;
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("renewDeposit (manual)", function () {
  it("mints new NFT with compounded principal", async () => {
    const { core, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt));

    await core.connect(alice).renewDeposit(0, 0);

    const oldCert = await core.getDeposit(0);
    const newCert = await core.getDeposit(1);

    expect(oldCert.status).to.equal(2); // ManualRenewed
    const expectedInterest = calcInterest(USDC(1000), 250, 90);
    expect(newCert.principal).to.equal(USDC(1000) + expectedInterest);
    expect(newCert.status).to.equal(0); // Active
  });

  it("emits Renewed event", async () => {
    const { core, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt));
    await expect(core.connect(alice).renewDeposit(0, 0)).to.emit(core, "Renewed");
  });

  it("reverts if deposit not yet matured", async () => {
    const { core, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    await expect(core.connect(alice).renewDeposit(0, 0)).to.be.reverted;
  });

  it("reverts if new plan is disabled", async () => {
    const { core, owner, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt));
    await core.connect(owner).disablePlan(0);
    await expect(core.connect(alice).renewDeposit(0, 0)).to.be.reverted;
  });

  it("new deposit uses new plan's current APR", async () => {
    const { core, owner, alice } = await deployAll();
    // Create a 180-day plan at 3% (300 bps)
    await core.connect(owner).createPlan(180, 300, 0, 0, 500);
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt));
    await core.connect(alice).renewDeposit(0, 1); // renew to plan 1
    const newCert = await core.getDeposit(1);
    expect(newCert.aprBpsAtOpen).to.equal(300);
    expect(newCert.tenorDays).to.equal(180);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("autoRenewDeposit", function () {
  it("reverts if called before grace period ends", async () => {
    const { core, alice, bot } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    // At maturity but grace period not over
    await time.increaseTo(Number(cert.maturityAt) + 1 * 24 * 3600); // +1 day
    await expect(core.connect(bot).autoRenewDeposit(0)).to.be.reverted;
  });

  it("succeeds after grace period and locks original APR", async () => {
    const { core, owner, alice, bot } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);

    // Admin lowers APR — should NOT affect auto-renew
    await core.connect(owner).updatePlan(0, 50);

    // Jump past grace period (maturity + 3 days + 1 second)
    await time.increaseTo(Number(cert.maturityAt) + 3 * 24 * 3600 + 1);

    await core.connect(bot).autoRenewDeposit(0);

    const oldCert = await core.getDeposit(0);
    const newCert = await core.getDeposit(1);

    expect(oldCert.status).to.equal(3); // AutoRenewed
    expect(newCert.aprBpsAtOpen).to.equal(250); // original APR preserved
    const expectedInterest = calcInterest(USDC(1000), 250, 90);
    expect(newCert.principal).to.equal(USDC(1000) + expectedInterest);
  });

  it("emits Renewed event", async () => {
    const { core, alice, bot } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt) + 3 * 24 * 3600 + 1);
    await expect(core.connect(bot).autoRenewDeposit(0)).to.emit(core, "Renewed");
  });

  it("new NFT belongs to original depositor", async () => {
    const { core, alice, bot } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt) + 3 * 24 * 3600 + 1);
    await core.connect(bot).autoRenewDeposit(0);
    expect(await core.ownerOf(1)).to.equal(alice.address);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("Vault management", function () {
  it("fundVault increases balance", async () => {
    const { vault, usdc, owner } = await deployAll();
    const before = await vault.vaultBalance();
    await usdc.connect(owner).approve(await vault.getAddress(), USDC(1000));
    await vault.connect(owner).fundVault(USDC(1000));
    expect(await vault.vaultBalance()).to.equal(before + USDC(1000));
  });

  it("withdrawVault decreases balance", async () => {
    const { vault, owner } = await deployAll();
    const before = await vault.vaultBalance();
    await vault.connect(owner).withdrawVault(USDC(100));
    expect(await vault.vaultBalance()).to.equal(before - USDC(100));
  });

  it("withdrawVault reverts if amount exceeds balance", async () => {
    const { vault, owner } = await deployAll();
    const bal = await vault.vaultBalance();
    await expect(vault.connect(owner).withdrawVault(bal + USDC(1))).to.be.reverted;
  });

  it("non-owner cannot fundVault", async () => {
    const { vault, alice } = await deployAll();
    await expect(vault.connect(alice).fundVault(USDC(100))).to.be.reverted;
  });

  it("setFeeReceiver updates address", async () => {
    const { vault, owner, bob } = await deployAll();
    await vault.connect(owner).setFeeReceiver(bob.address);
    expect(await vault.feeReceiver()).to.equal(bob.address);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("Pause / Unpause", function () {
  it("pause blocks openDeposit", async () => {
    const { core, owner, alice } = await deployAll();
    await core.connect(owner).pause();
    await expect(core.connect(alice).openDeposit(0, USDC(100))).to.be.reverted;
  });

  it("pause blocks withdrawAtMaturity", async () => {
    const { core, owner, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt));
    await core.connect(owner).pause();
    await expect(core.connect(alice).withdrawAtMaturity(0)).to.be.reverted;
  });

  it("pause blocks earlyWithdraw", async () => {
    const { core, owner, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    await core.connect(owner).pause();
    await expect(core.connect(alice).earlyWithdraw(0)).to.be.reverted;
  });

  it("pause blocks renewDeposit", async () => {
    const { core, owner, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt));
    await core.connect(owner).pause();
    await expect(core.connect(alice).renewDeposit(0, 0)).to.be.reverted;
  });

  it("unpause restores operations", async () => {
    const { core, owner, alice } = await deployAll();
    await core.connect(owner).pause();
    await core.connect(owner).unpause();
    await expect(core.connect(alice).openDeposit(0, USDC(100))).to.not.be.reverted;
  });

  it("vault pause blocks payInterest", async () => {
    const { core, vault, owner, alice } = await deployAll();
    await core.connect(alice).openDeposit(0, USDC(1000));
    const cert = await core.getDeposit(0);
    await time.increaseTo(Number(cert.maturityAt));
    await vault.connect(owner).pause();
    await expect(core.connect(alice).withdrawAtMaturity(0)).to.be.reverted;
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe("Interest math", function () {
  it("calculates Alice example correctly (~6.16 USDC)", async () => {
    const { core } = await deployAll();
    // principal=1_000_000_000 (1000 USDC), APR=250bps, 90 days
    const result = await core.calcInterest(USDC(1000), 250, 90n * 86400n);
    // Expected ≈ 6_164_383
    expect(result).to.be.closeTo(6_164_383n, 10n);
  });

  it("multiply-before-divide preserves precision for small amounts", async () => {
    const { core } = await deployAll();
    // 1 USDC for 7 days at 1% APR — should not round to zero
    const result = await core.calcInterest(USDC(1), 100, 7n * 86400n);
    expect(result).to.be.gt(0n);
  });
});
