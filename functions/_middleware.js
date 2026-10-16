/**
 * Négociation Markdown pour Cloudflare Pages.
 * `Accept: text/markdown` sert le `.md` généré au build ; le reste suit le HTML
 * ou les Functions déjà en place (`/api/auth`, `/api/callback`).
 */

const NON_PAGE =
  /\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|map|mjs|pdf|png|svg|ttf|txt|webp|woff2?|xml|zip)$/i;

/**
 * @param {string} pathname
 */
function isNonPage(pathname) {
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/_astro/") || pathname.startsWith("/cdn-cgi/")) return true;
  if (pathname.endsWith(".md")) return true;
  return NON_PAGE.test(pathname);
}

/**
 * @param {string} pathname
 */
function hasDotDot(pathname) {
  try {
    return decodeURIComponent(pathname).split("/").includes("..");
  } catch {
    return true;
  }
}

/**
 * `/` et ses alias HTML pointent vers `/home.md`.
 * @param {string} pathname
 */
function toMarkdownPath(pathname) {
  let pagePath = pathname;
  if (pagePath.endsWith("/index.html")) {
    pagePath = pagePath.slice(0, -"/index.html".length) || "/";
  } else if (pagePath.endsWith(".html")) {
    pagePath = pagePath.slice(0, -".html".length);
  }
  if (pagePath.length > 1 && pagePath.endsWith("/")) {
    pagePath = pagePath.slice(0, -1);
  }
  if (pagePath === "" || pagePath === "/") return "/home.md";
  return `${pagePath}.md`;
}

/**
 * @param {{ request: Request, env: { ASSETS?: { fetch: (input: Request | string) => Promise<Response> } }, next: () => Promise<Response> }} context
 */
export async function onRequest(context) {
  const accept = context.request.headers.get("accept") ?? "";
  if (!accept.includes("text/markdown")) return context.next();

  const url = new URL(context.request.url);
  if (hasDotDot(url.pathname) || isNonPage(url.pathname) || !context.env.ASSETS) {
    return context.next();
  }

  const assetUrl = new URL(toMarkdownPath(url.pathname), url.origin);
  const asset = await context.env.ASSETS.fetch(new Request(assetUrl));
  if (!asset.ok) return context.next();

  const headers = new Headers(asset.headers);
  headers.set("Content-Type", "text/markdown; charset=utf-8");
  headers.set("Vary", "Accept");
  return new Response(asset.body, { status: asset.status, headers });
}
