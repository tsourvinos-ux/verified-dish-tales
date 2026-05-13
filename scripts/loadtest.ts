/**
 * Manual load-test for AI summary + reward redemption flows.
 * Not wired into CI. Run with:
 *   bunx tsx scripts/loadtest.ts summarize
 *   bunx tsx scripts/loadtest.ts redeem
 *
 * Required env:
 *   LOADTEST_BASE_URL   e.g. https://lodger.lovable.app
 *   LOADTEST_BEARER     a valid Supabase JWT (copy from devtools)
 *   LOADTEST_BUSINESS_ID  (summarize)
 *   LOADTEST_REWARD_ID    (redeem)
 * Optional:
 *   LOADTEST_CONCURRENCY  default 20
 */

const base = process.env.LOADTEST_BASE_URL;
const bearer = process.env.LOADTEST_BEARER;
const concurrency = Number(process.env.LOADTEST_CONCURRENCY ?? 20);

if (!base || !bearer) {
  console.error("Missing LOADTEST_BASE_URL or LOADTEST_BEARER");
  process.exit(1);
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function summarizeRun() {
  const businessId = process.env.LOADTEST_BUSINESS_ID;
  if (!businessId) throw new Error("LOADTEST_BUSINESS_ID required");
  const latencies: number[] = [];
  let hits = 0;
  let misses = 0;
  let rateLimited = 0;
  let errors = 0;
  const tasks = Array.from({ length: concurrency }, async () => {
    const t0 = performance.now();
    const res = await fetch(`${base}/api/summarize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ business_id: businessId, limit: 15 }),
    });
    await res.text();
    const dt = performance.now() - t0;
    latencies.push(dt);
    if (res.status === 429) rateLimited++;
    else if (!res.ok) errors++;
    else if (res.headers.get("X-Summary-Cache") === "HIT") hits++;
    else misses++;
  });
  await Promise.all(tasks);
  console.log("=== /api/summarize ===");
  console.log(`requests=${concurrency} hits=${hits} misses=${misses} 429=${rateLimited} errors=${errors}`);
  console.log(`p50=${pct(latencies, 50).toFixed(0)}ms p95=${pct(latencies, 95).toFixed(0)}ms p99=${pct(latencies, 99).toFixed(0)}ms`);
}

async function redeemRun() {
  const rewardId = process.env.LOADTEST_REWARD_ID;
  if (!rewardId) throw new Error("LOADTEST_REWARD_ID required");
  let success = 0;
  let alreadyRedeemed = 0;
  let other = 0;
  // Server fns expect a POST to the same URL the React app uses; easier to
  // hit the /_serverFn endpoint via the running app. For accuracy, we just
  // call the redeem flow concurrently and report counts.
  const tasks = Array.from({ length: concurrency }, async () => {
    const res = await fetch(`${base}/_serverFn/src_lib_ledger_functions_ts--redeemReward_createServerFn_handler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ data: { reward_id: rewardId } }),
    });
    const text = await res.text();
    if (res.ok) success++;
    else if (text.includes("already redeemed") || text.includes("not yours")) alreadyRedeemed++;
    else other++;
  });
  await Promise.all(tasks);
  console.log("=== redeemReward ===");
  console.log(`requests=${concurrency} success=${success} already_redeemed=${alreadyRedeemed} other=${other}`);
  if (success === 1) console.log("PASS: exactly one redemption succeeded");
  else console.log(`FAIL: expected exactly 1 success, got ${success}`);
}

const mode = process.argv[2];
if (mode === "summarize") await summarizeRun();
else if (mode === "redeem") await redeemRun();
else {
  console.error("Usage: bunx tsx scripts/loadtest.ts <summarize|redeem>");
  process.exit(1);
}