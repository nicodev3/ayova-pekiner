// @ts-check
/**
 * Markdown pour les agents, au build.
 *
 * On n’appelle pas `llms()` de astro-llms-md : sous Windows son glob
 * `dist\**\*.html` ne trouve aucun HTML et écrit des fichiers vides.
 * Le parcours se fait avec `fs` ; la conversion reste celle du paquet.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fileToUrlPath,
  generateLlmsFullTxtContent,
  generateLlmsTxtContent,
  generateMarkdownFile,
  processHtmlFile,
} from "astro-llms-md";

/** @param {URL | string} dir */
function resolveOutputDir(dir) {
  return typeof dir === "string" ? dir : fileURLToPath(dir);
}

/**
 * @param {string} dir
 * @param {string[]} files
 */
function collectHtmlFiles(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "_astro" || entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectHtmlFiles(fullPath, files);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".html") || entry.name === "404.html") continue;
    files.push(fullPath);
  }
}

/** @param {string} pathname */
function normalizeUrlPath(pathname) {
  const withLeading = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (withLeading === "/") return "/";
  return withLeading.replace(/\/+$/, "");
}

/** @param {string} distDir */
function readSitemapPathnames(distDir) {
  const names = fs
    .readdirSync(distDir)
    .filter((name) => /^sitemap-\d+\.xml$/.test(name))
    .sort();
  /** @type {Set<string>} */
  const pathnames = new Set();

  for (const name of names) {
    const xml = fs.readFileSync(path.join(distDir, name), "utf8");
    for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
      try {
        pathnames.add(normalizeUrlPath(new URL(match[1].trim()).pathname));
      } catch {
        // Une loc illisible ne doit pas faire entrer une page hors sitemap.
      }
    }
  }

  return pathnames;
}

/** @param {string} value */
function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * @param {string} html
 * @param {string} key
 */
function readMeta(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = tag.match(/\b(?:name|property)=["']([^"']+)["']/i)?.[1];
    if (name !== key) continue;
    const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? "";
    return decodeEntities(content);
  }
  return "";
}

/** @param {string} html */
function hasNoindex(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return tags.some((tag) => {
    const name = tag.match(/\bname=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (name !== "robots") return false;
    const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1]?.toLowerCase() ?? "";
    return content.split(/[\s,]+/).includes("noindex");
  });
}

/**
 * @param {string} siteUrl
 * @param {string} urlPath
 * @param {boolean} trailing
 */
function pageUrl(siteUrl, urlPath, trailing) {
  const base = siteUrl.replace(/\/$/, "");
  if (urlPath === "/") return trailing ? `${base}/` : base;
  const stem = urlPath.replace(/\/$/, "");
  return trailing ? `${base}${stem}/` : `${base}${stem}`;
}

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Les helpers retirent le slash final. On le remet sur les URL de page,
 * pas sur les liens `.md`.
 *
 * @param {string} text
 * @param {string} siteUrl
 * @param {{ urlPath: string }[]} pages
 */
function restoreTrailingSlashUrls(text, siteUrl, pages) {
  const sorted = [...pages].sort((a, b) => b.urlPath.length - a.urlPath.length);
  let out = text;
  for (const page of sorted) {
    const from = pageUrl(siteUrl, page.urlPath, false);
    const to = pageUrl(siteUrl, page.urlPath, true);
    if (from === to) continue;
    const pattern = new RegExp(`${escapeRegExp(from)}(?!\\/|\\.|[A-Za-z0-9_-])`, "g");
    out = out.replace(pattern, to);
  }
  return out;
}

/**
 * @param {string} distDir
 * @param {string} urlPath
 */
function markdownDiskPath(distDir, urlPath) {
  if (urlPath === "/") return path.join(distDir, "home.md");
  return path.join(distDir, `${urlPath.replace(/^\//, "")}.md`);
}

export default function llmsMd() {
  let siteUrl = "";
  /** @type {"always" | "never" | "ignore"} */
  let trailingSlash = "ignore";

  return {
    name: "llms-md",
    hooks: {
      /** @param {{ config: { site?: URL | string; trailingSlash?: "always" | "never" | "ignore" } }} context */
      "astro:config:setup": ({ config }) => {
        siteUrl = config.site ? String(config.site).replace(/\/$/, "") : "";
        trailingSlash = config.trailingSlash ?? "ignore";
      },
      /** @param {{ dir: URL; logger: { info: (message: string) => void; warn: (message: string) => void; error: (message: string) => void } }} context */
      "astro:build:done": async ({ dir, logger }) => {
        if (!siteUrl) {
          throw new Error("llms-md: `site` est absent de la configuration Astro.");
        }

        const distDir = path.resolve(resolveOutputDir(dir));
        const sitemapPaths = readSitemapPathnames(distDir);
        if (sitemapPaths.size === 0) {
          throw new Error("llms-md: aucun sitemap-N.xml trouvé dans dist.");
        }

        /** @type {string[]} */
        const htmlFiles = [];
        collectHtmlFiles(distDir, htmlFiles);

        const homeHtmlPath = path.join(distDir, "index.html");
        const homeHtml = fs.existsSync(homeHtmlPath) ? fs.readFileSync(homeHtmlPath, "utf8") : "";
        const siteName = readMeta(homeHtml, "og:site_name");
        const siteDescription = readMeta(homeHtml, "description");
        if (!siteName || !siteDescription) {
          throw new Error(
            "llms-md: nom ou description introuvable dans dist/index.html (og:site_name, description).",
          );
        }

        /** @type {import("astro-llms-md").PageData[]} */
        const pages = [];
        const seen = new Set();

        for (const filePath of htmlFiles) {
          const html = fs.readFileSync(filePath, "utf8");
          if (hasNoindex(html)) continue;

          const urlPath = normalizeUrlPath(fileToUrlPath(path.resolve(filePath), distDir));
          if (!sitemapPaths.has(urlPath) || seen.has(urlPath)) continue;

          const processed = await processHtmlFile(filePath, {
            title_selector: "h1",
            content_selector: "main",
          });
          if (!processed.title) {
            logger.warn(`llms-md: pas de titre pour ${urlPath}, page ignorée.`);
            continue;
          }

          seen.add(urlPath);

          pages.push({
            urlPath,
            filePath,
            source: "prerendered",
            ...processed,
          });
        }

        pages.sort((a, b) => a.urlPath.localeCompare(b.urlPath, "fr"));

        const missing = [...sitemapPaths].filter((pathname) => !seen.has(pathname));
        if (missing.length > 0) {
          logger.warn(
            `llms-md: ${missing.length} URL du sitemap sans page Markdown (${missing.slice(0, 5).join(", ")}).`,
          );
        }

        for (const page of pages) {
          let markdown = generateMarkdownFile(page, siteUrl);
          if (trailingSlash === "always") {
            markdown = restoreTrailingSlashUrls(markdown, siteUrl, [page]);
          }
          const destination = markdownDiskPath(distDir, page.urlPath);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, markdown, "utf8");
        }

        const llmsTxt = generateLlmsTxtContent(pages, siteUrl, siteName, siteDescription, true);
        fs.writeFileSync(path.join(distDir, "llms.txt"), llmsTxt, "utf8");

        let llmsFull = generateLlmsFullTxtContent(pages, siteUrl, siteName);
        if (trailingSlash === "always") {
          llmsFull = restoreTrailingSlashUrls(llmsFull, siteUrl, pages);
        }
        fs.writeFileSync(path.join(distDir, "llms-full.txt"), llmsFull, "utf8");

        logger.info(`llms-md: ${pages.length} page(s) Markdown, sitemap ${sitemapPaths.size} URL.`);
      },
    },
  };
}
