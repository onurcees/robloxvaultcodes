import { readFile, writeFile } from "node:fs/promises";

function codeKey(item) {
  return String(item.code || "").trim().toUpperCase();
}

async function main() {
  const raw = JSON.parse(await readFile("social-codes.json", "utf8"));

  const normalized = raw
    .map((item) => ({
      game: String(item.game || "").trim(),
      code: codeKey(item),
      status: String(item.status || "").toLowerCase() === "active" ? "active" : "expired",
      reward: String(item.reward || "").trim(),
      source: String(item.source || "").trim()
    }))
    .filter((item) => item.code.length >= 3);

  const map = new Map();
  for (const row of normalized) {
    const key = `${row.game.toLowerCase()}::${row.code}`;
    if (!map.has(key)) {
      map.set(key, row);
      continue;
    }

    const existing = map.get(key);
    if (existing.status === "expired" && row.status === "active") {
      map.set(key, row);
    }
  }

  const deduped = [...map.values()];
  const activeOnly = deduped.filter((item) => item.status === "active");

  activeOnly.sort((a, b) => {
    if (a.game !== b.game) {
      return a.game.localeCompare(b.game);
    }
    return a.code.localeCompare(b.code);
  });

  await writeFile("social-codes-lite.json", JSON.stringify(activeOnly), "utf8");
  console.log(`[done] social-codes-lite.json => ${activeOnly.length} active records`);
}

main().catch((error) => {
  console.error(`[fatal] ${error.message}`);
  process.exitCode = 1;
});
