/**
 * go-go-scope v1.7.0 - Advanced Stream Features Demo
 * 
 * This example showcases the new Stream methods added in v1.7.0:
 * - groupedWithin: Time/size based batching
 * - groupByKey: Key-based grouping into substreams
 * - zipLatest: Latest value combining
 * - zipAll: Zip with defaults for unequal streams
 * - interleave: Fair round-robin interleaving
 * - cross: Cartesian product
 */

import { scope } from "../dist/index.mjs";

async function* fromArray<T>(arr: T[], delayMs = 0) {
  for (const item of arr) {
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    yield item;
  }
}

async function main() {
  console.log("🌊 go-go-scope Stream API Demo - v1.7.0 Features\n");

  // ============================================================
  // Example 1: Event Batch Processing
  // ============================================================
  console.log("📦 Example 1: Event Batching (groupedWithin)");
  console.log("--------------------------------------------");

  const events = Array.from({ length: 25 }, (_, i) => ({
    id: i + 1,
    type: i % 3 === 0 ? "error" : i % 2 === 0 ? "warn" : "info",
    message: `Event ${i + 1}`,
  }));

  await using s1 = scope();
  const [err1, batches] = await s1
    .stream(fromArray(events))
    .groupedWithin(10, 100)
    .toArray();

  console.log(`Grouped ${events.length} events into ${batches?.length} batches`);
  batches?.forEach((batch, i) => {
    const types = batch.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(
      `  Batch ${i + 1}: ${batch.length} events (${JSON.stringify(types)})`
    );
  });

  // ============================================================
  // Example 2: Parallel Processing with Partition
  // ============================================================
  console.log("\n⚡ Example 2: Parallel Processing (partition)");
  console.log("--------------------------------------------");

  await using s2 = scope();
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const [evens, odds] = s2
    .stream(fromArray(numbers))
    .partition((n) => n % 2 === 0);

  const [[err2a, evenResults], [err2b, oddResults]] = await Promise.all([
    evens.map((n) => n * 10).toArray(),
    odds.map((n) => n * 100).toArray(),
  ]);

  console.log("Even numbers × 10:", evenResults);
  console.log("Odd numbers × 100:", oddResults);

  // ============================================================
  // Example 3: Grouping by Key into Substreams
  // ============================================================
  console.log("\n📁 Example 3: Grouping by Key (groupByKey)");
  console.log("------------------------------------------");

  await using s3 = scope();
  const logEvents = [
    { level: "info", msg: "Server started" },
    { level: "error", msg: "Connection failed" },
    { level: "info", msg: "Request received" },
    { level: "warn", msg: "High memory" },
    { level: "error", msg: "Timeout" },
    { level: "info", msg: "Response sent" },
  ];

  const { groups, done } = s3
    .stream(fromArray(logEvents))
    .groupByKey((e) => e.level);

  const [errInfo, infoLogs] = await groups.get("info").toArray();
  const [errError, errorLogs] = await groups.get("error").toArray();
  const [errWarn, warnLogs] = await groups.get("warn").toArray();

  await done;

  console.log(
    `Info (${infoLogs?.length}): ${infoLogs?.map((e) => e.msg).join(", ")}`
  );
  console.log(
    `Error (${errorLogs?.length}): ${errorLogs?.map((e) => e.msg).join(", ")}`
  );
  console.log(
    `Warn (${warnLogs?.length}): ${warnLogs?.map((e) => e.msg).join(", ")}`
  );

  // ============================================================
  // Example 4: Fair Interleave
  // ============================================================
  console.log("\n🔄 Example 4: Fair Interleave (interleave)");
  console.log("------------------------------------------");

  await using s4 = scope();
  const sourceA = s4.stream(fromArray(["A1", "A2", "A3"]));
  const sourceB = s4.stream(fromArray(["B1", "B2", "B3"]));
  const sourceC = s4.stream(fromArray(["C1", "C2", "C3"]));

  const [err4, interleaved] = await sourceA
    .interleave(sourceB, sourceC)
    .toArray();

  console.log("Round-robin:", interleaved?.join(" → "));

  // ============================================================
  // Example 5: Cartesian Product
  // ============================================================
  console.log("\n✨ Example 5: Cartesian Product (cross)");
  console.log("----------------------------------------");

  await using s5 = scope();
  const colors = ["Red", "Blue", "Green"];
  const sizes = ["S", "M"];

  const [err5, combinations] = await s5
    .stream(fromArray(colors))
    .cross(s5.stream(fromArray(sizes)))
    .map(([color, size]) => `${color}-${size}`)
    .toArray();

  console.log("Product variants:", combinations?.join(", "));

  // ============================================================
  // Example 6: Zip with Defaults
  // ============================================================
  console.log("\n🔗 Example 6: Zip with Defaults (zipAll)");
  console.log("----------------------------------------");

  await using s6 = scope();
  const shortStream = s6.stream(fromArray([1, 2]));
  const longStream = s6.stream(fromArray(["a", "b", "c", "d"]));

  const [err6, zipped] = await shortStream
    .zipAll(longStream, 0, "default")
    .toArray();

  console.log("Zipped result:");
  zipped?.forEach(([n, s]) => {
    console.log(`  [${n}, "${s}"]`);
  });

  // ============================================================
  // Example 7: Complex Pipeline
  // ============================================================
  console.log("\n🔧 Example 7: Complex Pipeline");
  console.log("------------------------------");

  await using s7 = scope();
  const rawData = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    category: i % 5 === 0 ? "A" : i % 3 === 0 ? "B" : "C",
    value: Math.floor(Math.random() * 100),
  }));

  // Group by category first
  const { groups: categoryGroups, done: groupingDone } = s7
    .stream(fromArray(rawData))
    .groupByKey((item) => item.category);

  // Process each category: filter valid items, calculate stats
  const categories = ["A", "B", "C"];
  const categoryResults = await Promise.all(
    categories.map(async (cat) => {
      const [err, items] = await categoryGroups.get(cat).toArray();
      const validItems = items?.filter((item) => item.value > 20) ?? [];
      const invalidCount = (items?.length ?? 0) - validItems.length;
      const sum = validItems.reduce((acc, item) => acc + item.value, 0);
      return { category: cat, total: items?.length ?? 0, valid: validItems.length, invalid: invalidCount, sum };
    })
  );

  await groupingDone;

  console.log("Processing Results:");
  categoryResults.forEach(({ category, total, valid, invalid, sum }) => {
    console.log(
      `  Category ${category}: ${total} total (${valid} valid, ${invalid} invalid), valid sum = ${sum}`
    );
  });

  console.log("\n✅ Demo complete!");
}

main().catch(console.error);
