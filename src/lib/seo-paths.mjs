/**
 * Pages techniques, jamais indexées (sitemap + robots.txt).
 * Module isolé : `astro.config.mjs` ne doit pas être importé depuis `src/`
 * (il embarquerait `astro/config` et casse le build).
 */
export const NON_INDEXABLE_PATHS = ["/admin/", "/client-config/"];
