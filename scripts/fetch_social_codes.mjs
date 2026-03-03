import { writeFile } from "node:fs/promises";

const LIST_URL = "https://www.pockettactics.com/roblox/game-codes";
const DEFAULT_LIMIT = 250;
const DEFAULT_CONCURRENCY = 8;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const limitArg = Number(process.argv[2] || DEFAULT_LIMIT);
const concurrencyArg = Number(process.argv[3] || DEFAULT_CONCURRENCY);
const PAGE_LIMIT = Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : DEFAULT_LIMIT;
const CONCURRENCY = Number.isFinite(concurrencyArg) && concurrencyArg > 0 ? Math.floor(concurrencyArg) : DEFAULT_CONCURRENCY;

function decodeHtml(text) {
  return text
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([\da-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(input) {
  return decodeHtml(input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeCode(code) {
  let value = String(code || "").trim();
  value = value.replace(/[\u201C\u201D"'`]/g, "");
  value = value.replace(/^[-:\s]+|[-:\s]+$/g, "");
  value = value.replace(/\s+/g, "");
  return value;
}

function isValidCode(value) {
  if (!value || value.length < 3 || value.length > 40) {
    return false;
  }
  if (/^[0-9]+$/.test(value)) {
    return false;
  }
  if (/^(copy|paste|redeem|rewards?)$/i.test(value)) {
    return false;
  }
  return true;
}

function extractListCodes(fragment) {
  const output = [];
  const matches = [...fragment.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  for (const match of matches) {
    const li = match[1];
    const strong = li.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    const raw = strong ? stripTags(strong[1]) : stripTags(li.split(" - ")[0]);
    const code = normalizeCode(raw);
    if (isValidCode(code)) {
      output.push(code);
    }
  }
  return [...new Set(output)];
}

function titleToGameName(html, url) {
  const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  if (titleMatch) {
    const cleaned = stripTags(titleMatch[1])
      .replace(/\s+codes?.*$/i, "")
      .replace(/\s+march\s+\d{4}$/i, "")
      .trim();
    if (cleaned) {
      return cleaned;
    }
  }

  const path = new URL(url).pathname.split("/").filter(Boolean);
  if (path.length >= 2) {
    const slug = path[path.length - 2];
    return slug
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return "Unknown Game";
}

function extractCodesFromHtml(html) {
  const active = [];
  const expired = [];

  const activeStart = html.search(/Here are all the (?:new|latest|working|active)[^<]*codes/i);
  if (activeStart !== -1) {
    const block = html.slice(activeStart, activeStart + 80000);
    const end = block.search(/Expired codes|How do\s*I redeem|How to redeem|What are [^<]*codes\?/i);
    const activeBlock = end === -1 ? block : block.slice(0, end);
    active.push(...extractListCodes(activeBlock));
  }

  const expiredStart = html.search(/Expired codes/i);
  if (expiredStart !== -1) {
    const block = html.slice(expiredStart, expiredStart + 80000);
    const end = block.search(/How do\s*I redeem|How to redeem|What are [^<]*codes\?|Where can I get more/i);
    const expiredBlock = end === -1 ? block : block.slice(0, end);
    expired.push(...extractListCodes(expiredBlock));
  }

  return {
    active: [...new Set(active)],
    expired: [...new Set(expired)]
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

function toRecord(game, code, status, source) {
  return {
    game,
    type: "Community Code",
    code,
    expires: status === "expired" ? "Expired" : "Unknown",
    by: "PocketTactics",
    status,
    source
  };
}

async function collectSourceLinks() {
  const html = await fetchText(LIST_URL);
  const links = [...html.matchAll(/https:\/\/www\.pockettactics\.com\/[a-z0-9-]+\/[a-z0-9-]*codes[a-z0-9-]*/gi)]
    .map((m) => m[0])
    .map((url) => url.replace(/\/+$/, ""))
    .filter((url) => !/\/roblox\/game-codes$/i.test(url));

  const unique = [...new Set(links)];
  return unique.slice(0, PAGE_LIMIT);
}

async function runPool(items, worker, concurrency) {
  let cursor = 0;
  const results = [];

  const runners = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;

      const item = items[currentIndex];
      try {
        const result = await worker(item, currentIndex);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.warn(`[warn] ${item} -> ${error.message}`);
      }
    }
  });

  await Promise.all(runners);
  return results;
}

async function main() {
  console.log(`[info] Source list: ${LIST_URL}`);
  const links = await collectSourceLinks();
  console.log(`[info] Target pages: ${links.length}`);

  const pageResults = await runPool(
    links,
    async (url, index) => {
      const html = await fetchText(url);
      const game = titleToGameName(html, url);
      const { active, expired } = extractCodesFromHtml(html);
      console.log(`[ok] ${index + 1}/${links.length} ${game} -> active=${active.length}, expired=${expired.length}`);
      return { game, url, active, expired };
    },
    CONCURRENCY
  );

  const records = [];
  for (const page of pageResults) {
    for (const code of page.active) {
      records.push(toRecord(page.game, code, "active", page.url));
    }
    for (const code of page.expired) {
      records.push(toRecord(page.game, code, "expired", page.url));
    }
  }

  const dedupe = new Map();
  for (const item of records) {
    const key = `${item.game.toLowerCase()}::${item.code.toLowerCase()}`;
    if (!dedupe.has(key) || dedupe.get(key).status === "expired") {
      dedupe.set(key, item);
    }
  }

  const output = [...dedupe.values()].sort((a, b) => {
    if (a.game === b.game) {
      return a.code.localeCompare(b.code);
    }
    return a.game.localeCompare(b.game);
  });

  await writeFile("social-codes.json", JSON.stringify(output, null, 2), "utf8");
  console.log(`[done] Wrote social-codes.json with ${output.length} records.`);
}

main().catch((error) => {
  console.error(`[fatal] ${error.message}`);
  process.exitCode = 1;
});
