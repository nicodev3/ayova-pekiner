import type { ClientConfig } from "./schema.ts";

type Business = ClientConfig["business"];

/** Ligne rue + complément (code, bâtiment…) pour affichage. */
export function businessStreetLines(b: Business): string[] {
  if (b.addressPending) return [];
  const line1 = b.addressLine1.trim();
  const line2 = b.addressLine2?.trim() ?? "";
  return [line1, line2].filter((s) => s.length > 0);
}

/** Adresse complète sur une ligne (géocodage, mentions légales). */
export function businessAddressText(b: Business): string {
  if (b.addressPending) return "Adresse du cabinet à confirmer";
  return `${businessStreetLines(b).join(", ")}, ${b.postalCode} ${b.city}`;
}
