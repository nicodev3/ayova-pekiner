import type { ClientConfig } from "../client/schema.ts";

function emptyValue(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, emptyValue(item)]));
  }
  if (typeof value === "string") return "";
  if (typeof value === "boolean") return false;
  return undefined;
}

/** Questionnaire vierge ; seuls la version et les URL techniques du site sont conservés. */
export function createEmptyClientConfig(source: ClientConfig): Record<string, unknown> {
  const empty = emptyValue(source) as Record<string, unknown>;
  empty.schemaVersion = source.schemaVersion;
  empty.seo = {
    baseUrl: source.seo.baseUrl,
    ogImage: source.seo.ogImage,
    description: "",
  };
  return empty;
}
