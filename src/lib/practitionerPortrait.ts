import type { ImageMetadata } from "astro";

/** Le même état pilote la mise en page À propos et le rendu du portrait. */
const portraits = import.meta.glob<{ default: ImageMetadata }>("../assets/photos/portrait.webp", {
  eager: true,
});

export const practitionerPortrait = Object.values(portraits)[0]?.default ?? null;
