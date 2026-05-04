/**
 * autoRenewBot.js — Batch job tự động gia hạn deposit lúc 0h00 mỗi ngày
 *
 * Cách chạy:
 *   node scripts/autoRenewBot.js --network sepolia
 *   node scripts/autoRenewBot.js --network localhost
 *
 * Bot sẽ:
 *   1. Tính thời gian đến 0h00 hôm nay (hoặc ngày mai nếu đã qua 0h)
 *   2. Chờ đến đúng 0h00
 *   3. Quét tất cả deposit đã qua grace period → auto renew
 *   4. Lặp lại lúc 0h00 ngày hôm sau
 */

require("dotenv").config();
const { ethers } = require("ethers");

// ─── Config ──────────────────────────────────────────────────────────────────

const NETWORK      = process.argv.includes("--network")
  ? process.argv[process.argv.indexOf("--network") + 1]
  : "sepolia";

let GRACE_PERIOD = parseInt(process.env.GRACE_PERIOD_SEC || "259200"); // đọc từ .env, override bởi contract
const BATCH_HOUR   = parseInt(process.env.BATCH_HOUR       || "0");      // 0 = 0h00
const BATCH_MINUTE = parseInt(process.env.BATCH_MINUTE     || "0");      // 0 = :00

const RPC_URL = NETWORK === "localhost"
  ? "http://127.0.0.1:8545"
  : `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;

// ─── ABI ─────────────────────────────────────────────────────────────────────

const CORE_ABI = [
  "function nextDepositId() view returns (uint256)",
  "function getDeposit(uint256) view returns (tuple(uint256 planId, uint256 principal, uint256 aprBpsAtOpen, uint256 penaltyBpsAtOpen, uint256 tenorDays, uint256 startAt, uint256 maturityAt, uint8 status))",
  "function autoRenewDeposit(uint256 depositId) returns (uint256)",
  "function gracePeriod() view returns (uint256)",
  "function setGracePeriod(uint256) external",
  "event DepositOpened(uint256 indexed depositId, address indexed owner, uint256 indexed planId, uint256 principal, uint256 maturityAt, uint256 aprBpsAtOpen)",
  "event Renewed(uint256 indexed oldDepositId, uint256 indexed newDepositId, uint256 newPrincipal, uint256 indexed newPlanId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt     = (n)  => (Number(n) / 1e6).toFixed(2);
const fmtDate = (ts) => new Date(Number(ts) * 1000).toLocaleString("vi-VN");
const pad     = (n)  => String(n).padStart(2, "0");
const log     = (msg) => console.log(`[${new Date().toLocaleTimeString("vi-VN")}] ${msg}`);
const logOk   = (msg) => console.log(`[${new Date().toLocaleTimeString("vi-VN")}] ✅ ${msg}`);
const logWarn = (msg) => console.log(`[${new Date().toLocaleTimeString("vi-VN")}] ⚠️  ${msg}`);
const logErr  = (msg) => console.log(`[${new Date().toLocaleTimeString("vi-VN")}] ❌ ${msg}`);

// ─── Tính thời gian đến lần chạy tiếp theo ───────────────────────────────────

function msUntilNextBatch() {
  const now  = new Date();
  const next = new Date(now);

  next.setHours(BATCH_HOUR, BATCH_MINUTE, 0, 0);

  // Nếu giờ batch đã qua trong ngày hôm nay → chờ đến ngày mai
  if (next <= now) next.setDate(next.getDate() + 1);

  const ms = next - now;

  const hours   = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);

  return {
    ms,
    label:   `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`,
    nextRun: next,
  };
}

// ─── Load contract address ────────────────────────────────────────────────────

function loadContractAddress() {
  const fs   = require("fs");
  const path = require("path");
  const contractsPath = path.join(__dirname, "../frontend/src/contracts.js");

  if (fs.existsSync(contractsPath)) {
    const content = fs.readFileSync(contractsPath, "utf8");
    const match   = content.match(/SavingCore:\s*"(0x[a-fA-F0-9]{40})"/);
    if (match) return match[1];
  }

  if (process.env.SAVING_CORE_ADDRESS) return process.env.SAVING_CORE_ADDRESS;

  throw new Error(
    "Không tìm thấy địa chỉ SavingCore!\n" +
    "Hãy deploy contract trước hoặc set SAVING_CORE_ADDRESS trong .env"
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

const stats = {
  totalBatchRuns: 0,
  totalRenewed:   0,
  totalFailed:    0,
  totalSkipped:   0,
  startedAt:      new Date(),
  lastBatchAt:    null,
  history:        [], // Lưu kết quả từng ngày
};

function printStats() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 Batch Job Statistics");
  console.log(`   Started      : ${stats.startedAt.toLocaleString("vi-VN")}`);
  console.log(`   Last batch   : ${stats.lastBatchAt?.toLocaleString("vi-VN") || "chưa chạy"}`);
  console.log(`   Total runs   : ${stats.totalBatchRuns} lần`);
  console.log(`   Total renewed: ${stats.totalRenewed} deposits ✅`);
  console.log(`   Total failed : ${stats.totalFailed} deposits ❌`);
  console.log(`   Total skipped: ${stats.totalSkipped} deposits`);
  if (stats.history.length > 0) {
    console.log("\n   Lịch sử 7 ngày gần nhất:");
    stats.history.slice(-7).forEach(h => {
      console.log(`   ${h.date}: renewed=${h.renewed} failed=${h.failed} skipped=${h.skipped}`);
    });
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// ─── Batch job chính ─────────────────────────────────────────────────────────

async function runBatchJob(core) {
  const batchDate = new Date().toLocaleDateString("vi-VN");
  console.log("\n" + "═".repeat(50));
  console.log(`🕛 BATCH JOB — ${new Date().toLocaleString("vi-VN")}`);
  console.log("═".repeat(50));

  const now = Math.floor(Date.now() / 1000);
  let renewed = 0, failed = 0, skipped = 0;

  // Lấy tất cả deposit IDs từ DepositOpened + Renewed events
  const allIds = new Set();
  try {
    // Deposit gốc do user mở
    const openEvs = await core.queryFilter(core.filters.DepositOpened(), 0, "latest");
    for (const e of openEvs) allIds.add(e.args[0].toString());

    // Deposit mới tạo bởi autoRenew/manualRenew (args[1] = newDepositId)
    const renewEvs = await core.queryFilter(core.filters.Renewed(), 0, "latest");
    for (const e of renewEvs) allIds.add(e.args[1].toString());

    log(`Tìm thấy ${allIds.size} deposit(s) trong hệ thống`);
  } catch (e) {
    logErr(`Không lấy được events: ${e.message}`);
    return;
  }

  if (allIds.size === 0) {
    log("Không có deposit nào — batch job kết thúc.");
    return;
  }

  const depositIds = [...allIds].map(id => BigInt(id));


  // Phân loại trước khi xử lý
  const toRenew  = [];
  const pending  = [];
  const inactive = [];

  for (const depositId of depositIds) {
    try {
      const cert = await core.getDeposit(depositId);

      if (cert.status !== 0n) {
        inactive.push(depositId);
        continue;
      }

      const gracePeriodEnd = Number(cert.maturityAt) + GRACE_PERIOD;

      if (now >= gracePeriodEnd) {
        toRenew.push({ depositId, cert });
      } else {
        pending.push({
          depositId,
          cert,
          remainingSec: gracePeriodEnd - now,
        });
      }
    } catch (e) {
      logErr(`Lỗi đọc deposit #${depositId}: ${e.message}`);
    }
  }

  // In tóm tắt phân loại
  console.log("\n📋 Phân loại deposits:");
  console.log(`   🔄 Cần auto renew : ${toRenew.length}`);
  console.log(`   ⏳ Chưa đủ điều kiện: ${pending.length}`);
  console.log(`   ✓  Không còn Active : ${inactive.length}`);

  // In danh sách chưa đủ điều kiện
  if (pending.length > 0) {
    console.log("\n⏳ Deposit chưa đủ điều kiện:");
    for (const p of pending) {
      const days  = Math.floor(p.remainingSec / 86400);
      const hours = Math.floor((p.remainingSec % 86400) / 3600);
      console.log(`   #${p.depositId}: còn ${days}d ${hours}h đến hết grace period`);
    }
  }

  // Xử lý batch renew
  if (toRenew.length > 0) {
    console.log("\n🔄 Bắt đầu auto renew batch...\n");

    for (let i = 0; i < toRenew.length; i++) {
      const { depositId, cert } = toRenew[i];
      const progress = `[${i + 1}/${toRenew.length}]`;

      try {
        const owner = await core.ownerOf(depositId);
        log(`${progress} Deposit #${depositId}`);
        log(`         Owner    : ${owner}`);
        log(`         Principal: ${fmt(cert.principal)} USDC`);
        log(`         APR      : ${Number(cert.aprBpsAtOpen) / 100}%`);
        log(`         Matured  : ${fmtDate(cert.maturityAt)}`);

        const tx      = await core.autoRenewDeposit(depositId);
        log(`         Tx hash  : ${tx.hash}`);
        const receipt = await tx.wait();

        // Parse Renewed event
        const renewedEvent = receipt.logs
          .map(l => { try { return core.interface.parseLog(l); } catch { return null; } })
          .find(e => e?.name === "Renewed");

        if (renewedEvent) {
          const newId   = renewedEvent.args[1];
          const newCert = await core.getDeposit(newId);
          logOk(`${progress} #${depositId} → #${newId} | Principal mới: ${fmt(newCert.principal)} USDC`);
        } else {
          logOk(`${progress} #${depositId} renewed thành công`);
        }

        renewed++;
        stats.totalRenewed++;

        // Delay nhỏ giữa các tx tránh nonce conflict
        if (i < toRenew.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }

      } catch (e) {
        logErr(`${progress} #${depositId} thất bại: ${e.reason || e.message}`);
        failed++;
        stats.totalFailed++;
      }
    }
  } else {
    log("Không có deposit nào cần auto renew trong batch job này.");
  }

  skipped = pending.length;
  stats.totalSkipped += skipped;
  stats.totalBatchRuns++;
  stats.lastBatchAt = new Date();
  stats.history.push({
    date:    batchDate,
    renewed, failed, skipped,
  });

  // Tóm tắt kết quả batch
  console.log("\n" + "─".repeat(50));
  console.log(`📊 Kết quả batch ${batchDate}:`);
  console.log(`   ✅ Renewed : ${renewed}`);
  console.log(`   ❌ Failed  : ${failed}`);
  console.log(`   ⏳ Skipped : ${skipped}`);
  console.log("─".repeat(50));

  printStats();
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

function scheduleNextBatch(core) {
  const { ms, label, nextRun } = msUntilNextBatch();

  log(`Batch job tiếp theo lúc: ${nextRun.toLocaleString("vi-VN")} (còn ${label})`);

  setTimeout(async () => {
    await runBatchJob(core);
    scheduleNextBatch(core); // Lên lịch cho ngày hôm sau
  }, ms);
}

// ─── Countdown hiển thị ──────────────────────────────────────────────────────

function startCountdown() {
  // Cập nhật countdown mỗi 60 giây
  setInterval(() => {
    const { label, nextRun } = msUntilNextBatch();
    log(`⏰ Batch job tiếp theo: ${nextRun.toLocaleString("vi-VN")} — còn ${label}`);
  }, 60_000);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   ChainSave — Auto Renew Batch Job (0h00)   ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`Network      : ${NETWORK}`);
  console.log(`RPC URL      : ${RPC_URL}`);
  console.log(`Batch time   : ${pad(BATCH_HOUR)}:${pad(BATCH_MINUTE)} mỗi ngày`);
  console.log(`Grace period : sẽ đọc từ contract sau khi kết nối`);
  console.log("");

  // Kiểm tra private key
  if (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY.includes("your_")) {
    logErr("PRIVATE_KEY chưa được set trong .env!");
    process.exit(1);
  }

  // Setup provider và signer
  let provider, signer;
  try {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    signer   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const network = await provider.getNetwork();
    logOk(`Kết nối thành công — Chain ID: ${network.chainId}`);
    logOk(`Bot wallet : ${signer.address}`);

    const balance = await provider.getBalance(signer.address);
    log(`ETH balance: ${ethers.formatEther(balance)} ETH`);

    if (balance < ethers.parseEther("0.05")) {
      logWarn("ETH thấp! Nên có ít nhất 0.05 ETH để trả gas cho nhiều tx.");
    }
  } catch (e) {
    logErr(`Không kết nối được RPC: ${e.message}`);
    process.exit(1);
  }

  // Load contract
  let coreAddress;
  try {
    coreAddress = loadContractAddress();
    logOk(`SavingCore : ${coreAddress}`);
  } catch (e) {
    logErr(e.message);
    process.exit(1);
  }

  const core = new ethers.Contract(coreAddress, CORE_ABI, signer);

  // Kiểm tra contract
  try {
    const count = await core.nextDepositId();
    logOk(`Contract OK — hiện có ${count} deposit(s)`);
  } catch (e) {
    logErr(`Contract không phản hồi: ${e.message.slice(0,100)}`);
    logErr(`Kiểm tra lại địa chỉ SavingCore: ${coreAddress}`);
    process.exit(1);
  }

  // Đọc gracePeriod từ contract bằng raw call (không phụ thuộc ABI)
  try {
    const iface = new ethers.Interface(["function gracePeriod() view returns (uint256)"]);
    const result = await provider.call({ to: coreAddress, data: iface.encodeFunctionData("gracePeriod") });
    GRACE_PERIOD = Number(iface.decodeFunctionResult("gracePeriod", result)[0]);
    logOk(`Grace Period : ${GRACE_PERIOD}s (${(GRACE_PERIOD/3600).toFixed(1)} giờ / ${(GRACE_PERIOD/86400).toFixed(2)} ngày)`);
  } catch (e) {
    // Contract cũ chưa có setGracePeriod — dùng env hoặc default
    const envGrace = parseInt(process.env.GRACE_PERIOD_SEC || "259200");
    GRACE_PERIOD = envGrace;
    logWarn(`gracePeriod không có trong contract — dùng GRACE_PERIOD_SEC=${GRACE_PERIOD}s từ .env`);
  }

  console.log("");

  // Chạy ngay 1 lần khi khởi động để xử lý deposit tồn đọng
  log("Chạy batch job khởi động (xử lý deposit tồn đọng nếu có)...");
  await runBatchJob(core);

  // Lên lịch chạy lúc 0h00 mỗi ngày
  scheduleNextBatch(core);

  // Hiển thị countdown mỗi phút
  startCountdown();

  log("Bot đang chạy. Nhấn Ctrl+C để dừng.\n");
}

// Bắt Ctrl+C
process.on("SIGINT", () => {
  console.log("\n\nBot đang dừng...");
  printStats();
  process.exit(0);
});

// Bắt lỗi không xử lý được
process.on("unhandledRejection", (reason) => {
  logErr(`Unhandled error: ${reason}`);
});

main().catch(e => {
  logErr(`Lỗi nghiêm trọng: ${e.message}`);
  process.exit(1);
});