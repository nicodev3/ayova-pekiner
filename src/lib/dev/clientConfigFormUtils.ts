/** Utilitaires pour l’éditeur client.json (navigateur uniquement). */

/** Attribut pour lier un contrôle au chemin JSON (surbrillance en cas d’erreur de validation). */
export const CLIENT_CONFIG_PATH_ATTR = "data-config-path";

export function attachClientConfigPath(element: HTMLElement, path: string): void {
  element.setAttribute(CLIENT_CONFIG_PATH_ATTR, path);
}

/** Marqueur + styles Tailwind appliqués aux champs invalides (voir `clearClientConfigFieldHighlights`). */
export const CLIENT_CONFIG_FIELD_INVALID_CLASS = "client-config-field-invalid";

export function clearClientConfigFieldHighlights(container: HTMLElement): void {
  for (const node of container.querySelectorAll<HTMLElement>(
    `.${CLIENT_CONFIG_FIELD_INVALID_CLASS}, [aria-invalid="true"]`,
  )) {
    node.classList.remove(CLIENT_CONFIG_FIELD_INVALID_CLASS, "ring-2", "ring-fg", "border-fg");
    node.removeAttribute("aria-invalid");
    const describedBy = node
      .getAttribute("aria-describedby")
      ?.split(/\s+/)
      .filter((id) => id && !id.startsWith("client-config-error-"));
    if (describedBy?.length) node.setAttribute("aria-describedby", describedBy.join(" "));
    else node.removeAttribute("aria-describedby");
  }
}

function escapeAttrSelector(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Surligne les contrôles dont l’attribut `data-config-path` correspond au chemin d’erreur (ou à un préfixe). */
export function highlightClientConfigFieldsForPaths(
  container: HTMLElement,
  paths: readonly { path: string; errorId: string }[],
): void {
  for (const { path, errorId } of paths) {
    if (path === "root") continue;
    const parts = path.split(".");
    for (let end = parts.length; end >= 1; end--) {
      const candidate = parts.slice(0, end).join(".");
      const sel = `[${CLIENT_CONFIG_PATH_ATTR}="${escapeAttrSelector(candidate)}"]`;
      const node = container.querySelector(sel);
      if (node instanceof HTMLElement) {
        node.classList.add(CLIENT_CONFIG_FIELD_INVALID_CLASS, "ring-2", "ring-fg", "border-fg");
        node.setAttribute("aria-invalid", "true");
        const describedBy = new Set(
          node.getAttribute("aria-describedby")?.split(/\s+/).filter(Boolean) ?? [],
        );
        describedBy.add(errorId);
        node.setAttribute("aria-describedby", [...describedBy].join(" "));
        if (node.getAttribute("role") === "group") {
          for (const control of node.querySelectorAll<HTMLElement>("input, select, textarea")) {
            control.setAttribute("aria-invalid", "true");
            const controlDescriptions = new Set(
              control.getAttribute("aria-describedby")?.split(/\s+/).filter(Boolean) ?? [],
            );
            controlDescriptions.add(errorId);
            control.setAttribute("aria-describedby", [...controlDescriptions].join(" "));
          }
        }
        break;
      }
    }
  }
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function isIndexSegment(segment: string): number | null {
  const n = Number(segment);
  return Number.isInteger(n) && String(n) === segment ? n : null;
}

export function getAt(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    const idx = isIndexSegment(p);
    if (idx !== null) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[idx];
    } else {
      cur = (cur as Record<string, unknown>)[p];
    }
  }
  return cur;
}

export function setAt(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const idx = isIndexSegment(p);
    if (idx !== null) {
      if (!Array.isArray(cur)) return;
      const next = cur[idx];
      if (next == null || typeof next !== "object") {
        const nextSeg = parts[i + 1]!;
        cur[idx] = isIndexSegment(nextSeg) !== null ? [] : {};
      }
      cur = cur[idx] as unknown;
    } else {
      const rec = cur as Record<string, unknown>;
      const nextSeg = parts[i + 1]!;
      if (rec[p] == null || typeof rec[p] !== "object") {
        rec[p] = isIndexSegment(nextSeg) !== null ? [] : {};
      }
      cur = rec[p] as unknown;
    }
  }
  const last = parts[parts.length - 1]!;
  const idx = isIndexSegment(last);
  if (idx !== null) {
    if (!Array.isArray(cur)) return;
    cur[idx] = value;
  } else {
    (cur as Record<string, unknown>)[last] = value;
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  attrs?: Record<string, string>,
  children?: (Node | string)[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "htmlFor") node.setAttribute("for", v);
      else node.setAttribute(k, v);
    }
  }
  if (children) {
    for (const c of children) {
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    }
  }
  return node;
}
