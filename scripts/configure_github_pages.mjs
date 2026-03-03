import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const args = process.argv.slice(2);
const HELP = `
Usage:
  node scripts/configure_github_pages.mjs <username> <repo> [options]

Examples:
  node scripts/configure_github_pages.mjs octocat my-roblox-site
  node scripts/configure_github_pages.mjs octocat octocat.github.io --user-site
  node scripts/configure_github_pages.mjs octocat my-roblox-site --ads-client=ca-pub-1234567890123456 --slot-top=1234567890 --slot-middle=0987654321 --email=admin@example.com

Options:
  --user-site            Deploy as https://<username>.github.io/
  --ads-client=<id>      AdSense client id (ca-pub-...)
  --slot-top=<id>        10-digit AdSense slot id for top ad
  --slot-middle=<id>     10-digit AdSense slot id for middle ad
  --email=<address>      Update contact email placeholder
`;

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(HELP.trim());
  process.exit(0);
}

const positional = args.filter((item) => !item.startsWith("--"));
const username = positional[0] || "";
const repo = positional[1] || "";

if (!username || !repo) {
  console.error("[error] username ve repo zorunlu.");
  console.log(HELP.trim());
  process.exit(1);
}

function getOption(name) {
  const prefix = `--${name}=`;
  const item = args.find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length).trim() : "";
}

function normalizeUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildSitemap(baseUrl) {
  const today = new Date().toISOString().slice(0, 10);
  const pages = ["", "about.html", "privacy.html", "terms.html", "contact.html"];

  const items = pages
    .map((path) => {
      const loc = new URL(path, ensureTrailingSlash(baseUrl)).toString();
      const config =
        path === ""
          ? { changefreq: "hourly", priority: "1.0" }
          : path === "about.html"
            ? { changefreq: "monthly", priority: "0.7" }
            : path === "contact.html"
              ? { changefreq: "yearly", priority: "0.6" }
              : { changefreq: "yearly", priority: "0.5" };

      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${config.changefreq}</changefreq>\n    <priority>${config.priority}</priority>\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

async function replaceInFile(filePath, replacer) {
  const content = await readFile(filePath, "utf8");
  const next = replacer(content);
  await writeFile(filePath, next, "utf8");
}

function applySiteConfig(content, siteUrl, adsClient, topSlot, middleSlot) {
  let next = content.replace(/siteUrl:\s*"[^"]*"/m, `siteUrl: "${siteUrl}"`);

  if (adsClient) {
    next = next.replace(/adsenseClient:\s*"[^"]*"/m, `adsenseClient: "${adsClient}"`);
  }

  if (topSlot) {
    next = next.replace(/top:\s*"[^"]*"/m, `top: "${topSlot}"`);
  }

  if (middleSlot) {
    next = next.replace(/middle:\s*"[^"]*"/m, `middle: "${middleSlot}"`);
  }

  return next;
}

async function main() {
  const userSiteMode = args.includes("--user-site") || repo.toLowerCase() === `${username.toLowerCase()}.github.io`;
  const baseUrl = userSiteMode
    ? `https://${username}.github.io`
    : `https://${username}.github.io/${repo}`;

  const normalizedBaseUrl = normalizeUrl(baseUrl);
  const sitemapUrl = `${ensureTrailingSlash(normalizedBaseUrl)}sitemap.xml`;

  const adsClient = getOption("ads-client");
  const slotTop = getOption("slot-top");
  const slotMiddle = getOption("slot-middle");
  const email = getOption("email");

  await replaceInFile("site-config.js", (content) =>
    applySiteConfig(content, normalizedBaseUrl, adsClient, slotTop, slotMiddle)
  );

  await writeFile(
    "robots.txt",
    `User-agent: *\nAllow: /\n\n# GitHub Pages sitemap\nSitemap: ${sitemapUrl}\n`,
    "utf8"
  );

  await writeFile("sitemap.xml", buildSitemap(normalizedBaseUrl), "utf8");

  if (email) {
    await replaceInFile("contact.html", (content) => content.replace(/admin@your-domain\.com/g, email));
  }

  console.log(`[done] GitHub Pages ayarları yazıldı.`);
  console.log(`[info] Base URL: ${normalizedBaseUrl}`);
  console.log(`[info] Sitemap: ${sitemapUrl}`);
  if (email) {
    console.log(`[info] Contact email updated: ${email}`);
  }
}

main().catch((error) => {
  console.error(`[fatal] ${error.message}`);
  process.exit(1);
});
