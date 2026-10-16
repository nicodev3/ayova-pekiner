import { migrateClientConfig } from "../lib/client/migrations.ts";
import { PRACTICE_OFFER_FORM_FAMILIES } from "../lib/practiceOfferFormFamilies.ts";
import { REGISTERED_PRACTICE_PAGES } from "../lib/practicePageRegistry.ts";
import {
  deepClone,
  el,
  getAt,
  setAt,
  attachClientConfigPath,
  clearClientConfigFieldHighlights,
  highlightClientConfigFieldsForPaths,
} from "../lib/dev/clientConfigFormUtils.ts";
import {
  mergePracticePageEnabledDefaults,
  mergePracticeOfferCustomApproachesDefaults,
  validateClientJsonRaw,
} from "../lib/dev/clientConfigFormValidate.ts";
import type { ClientValidationIssue } from "../lib/dev/clientConfigValidationUI.ts";

import {
  CONTACT_HOURS_WEEKDAY_LABELS,
  CONTACT_HOURS_WEEKDAY_ORDER,
  coerceContactHours,
} from "../lib/client/contactHours.ts";
import {
  SPECIALTY_MOTIF_LABEL_SET,
  SPECIALTY_MOTIF_ORDERED_LABELS,
  SPECIALTY_MOTIF_SECTIONS,
} from "../lib/client/specialtyMotifSections.ts";

type TabId = "business" | "practice" | "optional" | "cabinet";

const TABS: { id: TabId; label: string }[] = [
  { id: "business", label: "Vos informations" },
  { id: "practice", label: "Vos spécialités" },
  { id: "optional", label: "Offre de soins" },
  { id: "cabinet", label: "Cabinet & tarifs" },
];

const REGISTRATION_LABEL_OPTIONS = [
  { value: "adeli", label: "ADELI" },
  { value: "rpps", label: "RPPS" },
] as const;

const PROFESSION_FORM_OPTIONS = [
  { value: "", label: "Sélectionnez votre métier" },
  { value: "psychologue", label: "Psychologue" },
  { value: "psychomotricien", label: "Psychomotricien(ne)" },
] as const;

function ensureRecord(path: string, state: Record<string, unknown>): Record<string, unknown> {
  const v = getAt(state, path);
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  const parentPath = path.includes(".") ? path.slice(0, path.lastIndexOf(".")) : "";
  const key = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1) : path;
  const o: Record<string, unknown> = {};
  if (parentPath) {
    const existing = getAt(state, parentPath);
    const base =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    base[key] = o;
    setAt(state, parentPath, base);
  } else {
    state[key] = o;
  }
  return o;
}

function ensureArray(path: string, state: Record<string, unknown>): unknown[] {
  const v = getAt(state, path);
  if (Array.isArray(v)) return v;
  setAt(state, path, []);
  return getAt(state, path) as unknown[];
}

function normalizeContactHoursInFormState(state: Record<string, unknown>): void {
  const contact = state.contact;
  if (!contact || typeof contact !== "object" || Array.isArray(contact)) return;
  const c = contact as Record<string, unknown>;
  c.hours = coerceContactHours(c.hours);
}

/** Libellés de champs. */
const FORM_LABEL_CLASS = "block text-sm font-medium text-fg";
let clientConfigFieldId = 0;

function nextClientConfigFieldId(prefix: string): string {
  clientConfigFieldId += 1;
  return `${prefix}-${clientConfigFieldId}`;
}

/** Libellés des cases à cocher / radios. */
const FORM_CHECK_LABEL_CLASS =
  "flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium text-fg transition-colors hover:border-muted/20 hover:bg-accent/50";

/** Onglet « Offre de soins » : densifié. */
const PRACTICE_OFFER_FORM_TEXT_CLASS = "text-base leading-normal";
const PRACTICE_OFFER_FORM_LABEL_CLASS = `block ${PRACTICE_OFFER_FORM_TEXT_CLASS} font-medium text-fg`;
const PRACTICE_OFFER_FORM_CHECK_CLASS = `flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 ${PRACTICE_OFFER_FORM_TEXT_CLASS} font-medium text-fg transition-colors hover:bg-accent/60`;

/** Titre de section dans un panneau. */
const FORM_SECTION_TITLE_CLASS = "text-base font-semibold tracking-tight text-fg";

/** Panneau de regroupement. */
const FORM_SECTION_PANEL_CLASS = "space-y-4 border border-muted/25 bg-bg p-4 md:p-6";

/** Contrôles texte / select / textarea. */
const FORM_CONTROL_CLASS =
  "w-full min-w-0 rounded border border-muted bg-bg px-3 py-2.5 text-base text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

/** Boutons secondaires (ajouter / actions légères). */
const FORM_BTN_SECONDARY_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded border border-muted bg-bg px-4 py-2 text-sm font-medium text-fg hover:underline";

/** Boutons destructifs légers. */
const FORM_BTN_DANGER_CLASS =
  "min-h-11 px-2 text-sm font-medium text-fg underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-40";

function fieldWrap(
  labelText: string,
  control: HTMLElement,
  labelClass: string = FORM_LABEL_CLASS,
): HTMLElement {
  const wrap = el("div", "space-y-1.5");
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLSelectElement
  ) {
    if (!control.id) control.id = nextClientConfigFieldId("client-config-field");
    const lab = el("label", labelClass, { htmlFor: control.id }, [labelText]);
    wrap.appendChild(lab);
  } else {
    const labelId = nextClientConfigFieldId("client-config-group");
    const label = el("p", labelClass, { id: labelId }, [labelText]);
    control.setAttribute("role", "group");
    control.setAttribute("aria-labelledby", labelId);
    wrap.appendChild(label);
  }
  wrap.appendChild(control);
  return wrap;
}

function sectionHeading(title: string): HTMLElement {
  return el("p", FORM_SECTION_TITLE_CLASS, undefined, [title]);
}

function confirmRemove(value: unknown): boolean {
  const hasContent =
    typeof value === "object" && value !== null
      ? Object.values(value).some((item) => item != null && String(item).trim() !== "")
      : value != null && String(value).trim() !== "";
  return (
    !hasContent ||
    window.confirm(
      "Supprimer cette entrée ? Les informations saisies dans cette entrée seront perdues.",
    )
  );
}

/** Une colonne sur mobile ; à partir de md, plusieurs colonnes pour gagner de la hauteur sur desktop. */
function desktopFieldGrid(cols: 2 | 3, ...fields: HTMLElement[]): HTMLElement {
  const cls = cols === 3 ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3" : "grid gap-4 md:grid-cols-2";
  const row = el("div", cls);
  for (const f of fields) row.appendChild(f);
  return row;
}

/** Indications de saisie uniquement : ces textes ne sont jamais enregistrés comme réponses. */
const FIELD_PLACEHOLDERS: Readonly<Record<string, string>> = {
  "business.fullName": "Prénom Nom",
  "aboutPage.intro":
    "Présentez-vous rapidement en quelques lignes. Ce contenu pourra être changé ultérieurement dans votre interface de gestion.",
  "business.title": "Votre titre professionnel",
  "business.email": "prenom.nom@exemple.fr",
  "credentials.license.rppsOrAdeli": "Votre numéro ADELI ou RPPS",
  "business.siret": "Votre numéro SIRET à 14 chiffres",
  "business.city": "Nom de la ville",
  "business.postalCode": "Code postal à 5 chiffres",
  "business.addressLine1": "Numéro et nom de rue",
  "business.phone": "Ex. 06 00 00 00 00",
  "credentials.experienceYears": "Nombre d’années",
  "credentials.experiences.*.label": "Intitulé du poste ou de la fonction",
  "credentials.experiences.*.organization": "Nom de la structure ou de l’établissement",
  "credentials.experiences.*.period": "Ex. 2020 – aujourd’hui",
  "credentials.degrees.*.label": "Intitulé du diplôme",
  "credentials.degrees.*.institution": "Nom de l’établissement",
  "credentials.degrees.*.year": "Ex. 2020",
  "credentials.trainings.*.label": "Intitulé de la formation",
  "credentials.trainings.*.provider": "Nom de l’organisme de formation",
  "credentials.trainings.*.year": "Ex. 2020",
  "credentials.affiliations":
    "Nom d’une association ou d’un réseau professionnel, une entrée par ligne",
  "social.links.*.label": "Nom du réseau social",
  "social.links.*.href": "https://exemple.fr/votre-profil",
  "practice.languages": "Ex. français, une langue par ligne",
  "practice.reimbursement.monSoutienPsy.note":
    "Précisez les modalités de prise en charge proposées.",
  "contact.hours.*.value": "Ex. 9h – 12h / 14h – 18h",
  "contact.accessNote":
    "Indiquez les transports, le stationnement et les conditions d’accessibilité.",
  "pricing.items.*.name": "Intitulé de la consultation ou de la prestation",
  "pricing.items.*.price": "Montant en euros",
  "pricing.items.*.durationMinutes": "Durée en minutes",
  "pricing.items.*.note": "Précision sur cette prestation",
  "pricing.reducedRateNote": "Précisez les situations donnant accès à un tarif adapté.",
  "conditions.cancellation.noticeHours": "Nombre d’heures",
  "conditions.cancellation.feePolicy":
    "Décrivez vos conditions d’annulation et les frais éventuels.",
  "conditions.delay.graceMinutes": "Nombre de minutes",
  "conditions.delay.note": "Précisez le déroulement de la séance en cas de retard.",
  "conditions.noShow.note": "Précisez les conditions applicables en cas d’absence non signalée.",
};

function fieldPlaceholder(path: string): string {
  const normalizedPath = path.replace(/\.\d+(?=\.|$)/g, ".*");
  if (/^contact\.hours\.[^.]+\.value$/.test(path)) {
    return FIELD_PLACEHOLDERS["contact.hours.*.value"]!;
  }
  return FIELD_PLACEHOLDERS[normalizedPath] ?? "";
}

function textInput(
  state: Record<string, unknown>,
  path: string,
  onRefresh: () => void,
  opts?: string | { placeholder?: string; textClass?: string; disabled?: boolean },
): HTMLInputElement {
  const o = typeof opts === "string" ? { placeholder: opts } : (opts ?? {});
  const textClass = o.textClass ?? "text-base";
  const inp = el(
    "input",
    `${FORM_CONTROL_CLASS} ${textClass}${o.disabled ? " cursor-not-allowed opacity-50" : ""}`,
  ) as HTMLInputElement;
  inp.type = "text";
  inp.name = path;
  const autocompleteByPath: Record<string, string> = {
    "business.fullName": "name",
    "business.email": "email",
    "business.phone": "tel",
    "business.city": "address-level2",
    "business.postalCode": "postal-code",
    "business.addressLine1": "address-line1",
    "business.addressLine2": "address-line2",
  };
  if (autocompleteByPath[path]) inp.setAttribute("autocomplete", autocompleteByPath[path]);
  if (path === "business.email") inp.type = "email";
  if (path === "business.phone" || path === "contact.channels.whatsappPhone") inp.type = "tel";
  if (path === "contact.bookingUrl" || /^social\.links\.\d+\.href$/.test(path)) inp.type = "url";
  if (["business.siret", "business.postalCode", "credentials.license.rppsOrAdeli"].includes(path)) {
    inp.inputMode = "numeric";
  }
  inp.placeholder = o.placeholder ?? fieldPlaceholder(path);
  if (o.disabled) inp.disabled = true;
  const cur = getAt(state, path);
  inp.value = cur == null ? "" : String(cur);
  inp.addEventListener("input", () => {
    setAt(state, path, inp.value);
    onRefresh();
  });
  attachClientConfigPath(inp, path);
  return inp;
}

function numberInput(
  state: Record<string, unknown>,
  path: string,
  onRefresh: () => void,
  min?: number,
  max?: number,
): HTMLInputElement {
  const inp = el("input", FORM_CONTROL_CLASS) as HTMLInputElement;
  inp.type = "number";
  inp.placeholder = fieldPlaceholder(path);
  if (min != null) inp.min = String(min);
  if (max != null) inp.max = String(max);
  const cur = getAt(state, path);
  inp.value = cur == null || cur === "" ? "" : String(cur);
  inp.addEventListener("input", () => {
    const v = inp.value === "" ? undefined : Number(inp.value);
    setAt(state, path, Number.isNaN(v as number) ? undefined : v);
    onRefresh();
  });
  attachClientConfigPath(inp, path);
  return inp;
}

function textareaInput(
  state: Record<string, unknown>,
  path: string,
  onRefresh: () => void,
  rows = 3,
): HTMLTextAreaElement {
  const ta = el("textarea", `${FORM_CONTROL_CLASS} min-h-24 resize-y`) as HTMLTextAreaElement;
  ta.rows = rows;
  ta.placeholder = fieldPlaceholder(path);
  const cur = getAt(state, path);
  ta.value = cur == null ? "" : String(cur);
  ta.addEventListener("input", () => {
    setAt(state, path, ta.value);
    onRefresh();
  });
  attachClientConfigPath(ta, path);
  return ta;
}

function selectLabeled(
  state: Record<string, unknown>,
  path: string,
  options: readonly { value: string; label: string }[],
  onRefresh: () => void,
): HTMLSelectElement {
  const sel = el("select", FORM_CONTROL_CLASS) as HTMLSelectElement;
  const values = options.map((o) => o.value);
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    sel.appendChild(opt);
  }
  const cur = getAt(state, path);
  sel.value = cur != null && values.includes(String(cur)) ? String(cur) : options[0]!.value;
  sel.addEventListener("change", () => {
    setAt(state, path, sel.value);
    onRefresh();
  });
  attachClientConfigPath(sel, path);
  return sel;
}

function checkboxInput(
  state: Record<string, unknown>,
  path: string,
  onRefresh: () => void,
  label: string,
  labelClass: string = FORM_CHECK_LABEL_CLASS,
): HTMLElement {
  const wrap = el("label", labelClass);
  const inp = el(
    "input",
    "mt-0.5 size-4 shrink-0 rounded border-muted/40 text-primary accent-primary",
  ) as HTMLInputElement;
  inp.type = "checkbox";
  const cur = getAt(state, path);
  inp.checked = Boolean(cur);
  inp.addEventListener("change", () => {
    setAt(state, path, inp.checked);
    onRefresh();
  });
  wrap.appendChild(inp);
  wrap.appendChild(el("span", "leading-snug", undefined, [label]));
  attachClientConfigPath(wrap, path);
  return wrap;
}

function registrationLabelRadioGroup(
  state: Record<string, unknown>,
  path: string,
  onRefresh: () => void,
  onTypeChange?: () => void,
): HTMLElement {
  const root = el("div", "space-y-2", { role: "group" });
  const labelId = nextClientConfigFieldId("client-config-registration-label");
  root.setAttribute("aria-labelledby", labelId);
  root.appendChild(
    el("span", FORM_LABEL_CLASS, { id: labelId }, ["Type d’inscription (si connu)"]),
  );
  const group = el("div", "flex flex-wrap gap-2");
  const cur = getAt(state, path);
  const name = `registration-label-${path.replace(/\./g, "-")}`;
  const selectedClass =
    "flex cursor-pointer items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition-colors";
  const idleClass =
    "flex cursor-pointer items-center gap-2 rounded-xl border border-muted/25 bg-bg px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:border-muted/40 hover:bg-accent/40";
  const rows: { inp: HTMLInputElement; row: HTMLElement; value: string }[] = [];
  for (const opt of REGISTRATION_LABEL_OPTIONS) {
    const row = el("label", cur === opt.value ? selectedClass : idleClass);
    const inp = el("input", "size-4 border-muted/40 accent-primary") as HTMLInputElement;
    inp.type = "radio";
    inp.name = name;
    inp.value = opt.value;
    inp.checked = cur === opt.value;
    inp.addEventListener("change", () => {
      if (inp.checked) {
        setAt(state, path, opt.value);
        for (const r of rows) {
          r.row.className = r.value === opt.value ? selectedClass : idleClass;
        }
        onRefresh();
        onTypeChange?.();
      }
    });
    row.appendChild(inp);
    row.appendChild(document.createTextNode(opt.label));
    group.appendChild(row);
    rows.push({ inp, row, value: opt.value });
  }
  root.appendChild(group);
  attachClientConfigPath(root, path);
  return root;
}

const AUDIENCE_OPTIONS = [
  { value: "enfants", label: "Enfants" },
  { value: "adolescents", label: "Adolescents" },
  { value: "adultes", label: "Adultes" },
  { value: "couples", label: "Couples" },
  { value: "familles", label: "Familles" },
  { value: "analyse_pratiques", label: "Analyse des pratiques" },
  { value: "autre", label: "Autre (préciser)" },
] as const;

const AUDIENCE_IDS = new Set<string>(AUDIENCE_OPTIONS.map((o) => o.value));

function readAudienceSelection(path: string, state: Record<string, unknown>): Set<string> {
  const cur = getAt(state, path);
  const arr = Array.isArray(cur) ? (cur as string[]) : [];
  return new Set(arr.filter((v) => AUDIENCE_IDS.has(v)));
}

function writeAudienceSelection(
  state: Record<string, unknown>,
  audiencePath: string,
  otherPath: string,
  selected: Set<string>,
  onRefresh: () => void,
): void {
  const ordered = AUDIENCE_OPTIONS.map((o) => o.value).filter((v) => selected.has(v));
  setAt(state, audiencePath, ordered);
  if (!selected.has("autre")) {
    setAt(state, otherPath, "");
  }
  onRefresh();
}

/** Cases à cocher pour `practice.audience` + champ libre si « autre ». */
function audienceCheckboxGroup(
  state: Record<string, unknown>,
  audiencePath: string,
  otherPath: string,
  onRefresh: () => void,
): HTMLElement {
  const root = el("div", "grid grid-cols-1 items-start gap-x-4 gap-y-2 min-[400px]:grid-cols-2");
  const refreshAutreUi = (otherWrap: HTMLElement, autreChecked: boolean) => {
    otherWrap.classList.toggle("hidden", !autreChecked);
  };

  for (const opt of AUDIENCE_OPTIONS) {
    if (opt.value === "autre") {
      const block = el("div", "space-y-2");
      const row = el("label", FORM_CHECK_LABEL_CLASS);
      const inp = el("input", "size-4 rounded border-muted/40") as HTMLInputElement;
      inp.type = "checkbox";
      const sel = readAudienceSelection(audiencePath, state);
      inp.checked = sel.has("autre");
      const otherWrap = el("div", "ml-6 space-y-1");
      const otherInp = textInput(state, otherPath, onRefresh, "Préciser le public…");
      otherInp.setAttribute("aria-label", "Autre public accompagné");
      inp.addEventListener("change", () => {
        const s = readAudienceSelection(audiencePath, state);
        if (inp.checked) s.add("autre");
        else s.delete("autre");
        writeAudienceSelection(state, audiencePath, otherPath, s, onRefresh);
        if (!s.has("autre")) {
          otherInp.value = "";
        }
        refreshAutreUi(otherWrap, s.has("autre"));
      });
      refreshAutreUi(otherWrap, sel.has("autre"));
      row.appendChild(inp);
      row.appendChild(document.createTextNode(opt.label));
      block.appendChild(row);
      otherWrap.appendChild(otherInp);
      block.appendChild(otherWrap);
      root.appendChild(block);
      continue;
    }

    const row = el("label", FORM_CHECK_LABEL_CLASS);
    const inp = el("input", "size-4 rounded border-muted/40") as HTMLInputElement;
    inp.type = "checkbox";
    const sel = readAudienceSelection(audiencePath, state);
    inp.checked = sel.has(opt.value);
    inp.addEventListener("change", () => {
      const s = readAudienceSelection(audiencePath, state);
      if (inp.checked) s.add(opt.value);
      else s.delete(opt.value);
      writeAudienceSelection(state, audiencePath, otherPath, s, onRefresh);
      inp.checked = s.has(opt.value);
    });
    row.appendChild(inp);
    row.appendChild(document.createTextNode(opt.label));
    root.appendChild(row);
  }

  attachClientConfigPath(root, audiencePath);
  return root;
}

const CONSULTATION_MODE_OPTIONS = [
  { value: "cabinet", label: "Cabinet" },
  { value: "visio", label: "Visio" },
  { value: "domicile", label: "Domicile" },
] as const;

const CONSULTATION_MODE_IDS = new Set<string>(CONSULTATION_MODE_OPTIONS.map((o) => o.value));

function readConsultationModeSelection(path: string, state: Record<string, unknown>): Set<string> {
  const cur = getAt(state, path);
  const arr = Array.isArray(cur) ? (cur as string[]) : [];
  return new Set(arr.filter((v) => CONSULTATION_MODE_IDS.has(v)));
}

function writeConsultationModeSelection(
  state: Record<string, unknown>,
  modesPath: string,
  selected: Set<string>,
  onRefresh: () => void,
): void {
  const ordered = CONSULTATION_MODE_OPTIONS.map((o) => o.value).filter((v) => selected.has(v));
  setAt(state, modesPath, ordered);
  onRefresh();
}

function consultationModesCheckboxGroup(
  state: Record<string, unknown>,
  modesPath: string,
  onRefresh: () => void,
): HTMLElement {
  const root = el("div", "space-y-2");
  for (const opt of CONSULTATION_MODE_OPTIONS) {
    const row = el("label", FORM_CHECK_LABEL_CLASS);
    const inp = el("input", "size-4 rounded border-muted/40") as HTMLInputElement;
    inp.type = "checkbox";
    const sel = readConsultationModeSelection(modesPath, state);
    inp.checked = sel.has(opt.value);
    inp.addEventListener("change", () => {
      const s = readConsultationModeSelection(modesPath, state);
      if (inp.checked) s.add(opt.value);
      else s.delete(opt.value);
      writeConsultationModeSelection(state, modesPath, s, onRefresh);
      inp.checked = s.has(opt.value);
    });
    row.appendChild(inp);
    row.appendChild(document.createTextNode(opt.label));
    root.appendChild(row);
  }
  attachClientConfigPath(root, modesPath);
  return root;
}

const CONTACT_CHANNEL_OPTIONS = [
  { value: "form", label: "Formulaire de contact" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "Bouton WhatsApp" },
  { value: "phone", label: "Téléphone" },
  { value: "doctolib", label: "Doctolib (messagerie / RDV)" },
  { value: "other", label: "Autre" },
] as const;

const CONTACT_CHANNEL_IDS = new Set<string>(CONTACT_CHANNEL_OPTIONS.map((o) => o.value));

function readContactChannelSelection(path: string, state: Record<string, unknown>): Set<string> {
  const cur = getAt(state, path);
  const arr = Array.isArray(cur) ? (cur as string[]) : [];
  return new Set(arr.filter((v) => CONTACT_CHANNEL_IDS.has(v)));
}

function writeContactChannelSelection(
  state: Record<string, unknown>,
  channelsPath: string,
  otherPath: string,
  whatsappPhonePath: string,
  selected: Set<string>,
  onRefresh: () => void,
): void {
  const ordered = CONTACT_CHANNEL_OPTIONS.map((o) => o.value).filter((v) => selected.has(v));
  setAt(state, channelsPath, ordered);
  if (!selected.has("other")) {
    setAt(state, otherPath, "");
  }
  if (!selected.has("whatsapp")) {
    setAt(state, whatsappPhonePath, "");
  }
  onRefresh();
}

/** Cases à cocher pour `contact.channels.selected` + champs conditionnels. */
function contactChannelsCheckboxGroup(
  state: Record<string, unknown>,
  channelsPath: string,
  otherPath: string,
  whatsappPhonePath: string,
  onRefresh: () => void,
): HTMLElement {
  const root = el("div", "space-y-2");
  const refreshNestedUi = (wrap: HTMLElement, visible: boolean) => {
    wrap.classList.toggle("hidden", !visible);
  };

  for (const opt of CONTACT_CHANNEL_OPTIONS) {
    if (opt.value === "other") {
      const block = el("div", "space-y-2");
      const row = el("label", FORM_CHECK_LABEL_CLASS);
      const inp = el("input", "size-4 rounded border-muted/40") as HTMLInputElement;
      inp.type = "checkbox";
      const sel = readContactChannelSelection(channelsPath, state);
      inp.checked = sel.has("other");
      const otherWrap = el("div", "ml-6 space-y-1");
      const otherInp = textInput(state, otherPath, onRefresh, "Préciser le canal de contact…");
      otherInp.setAttribute("aria-label", "Autre canal de contact");
      inp.addEventListener("change", () => {
        const s = readContactChannelSelection(channelsPath, state);
        if (inp.checked) s.add("other");
        else s.delete("other");
        writeContactChannelSelection(
          state,
          channelsPath,
          otherPath,
          whatsappPhonePath,
          s,
          onRefresh,
        );
        if (!s.has("other")) {
          otherInp.value = "";
        }
        refreshNestedUi(otherWrap, s.has("other"));
      });
      refreshNestedUi(otherWrap, sel.has("other"));
      row.appendChild(inp);
      row.appendChild(document.createTextNode(opt.label));
      block.appendChild(row);
      otherWrap.appendChild(otherInp);
      block.appendChild(otherWrap);
      root.appendChild(block);
      continue;
    }

    if (opt.value === "whatsapp") {
      const block = el("div", "space-y-2");
      const row = el("label", FORM_CHECK_LABEL_CLASS);
      const inp = el("input", "size-4 rounded border-muted/40") as HTMLInputElement;
      inp.type = "checkbox";
      const sel = readContactChannelSelection(channelsPath, state);
      inp.checked = sel.has("whatsapp");
      const waWrap = el("div", "ml-6 space-y-1");
      waWrap.appendChild(
        fieldWrap(
          "Numéro WhatsApp (optionnel si identique au téléphone)",
          textInput(state, whatsappPhonePath, onRefresh, "Ex. 06 00 00 00 00"),
        ),
      );
      inp.addEventListener("change", () => {
        const s = readContactChannelSelection(channelsPath, state);
        if (inp.checked) s.add("whatsapp");
        else s.delete("whatsapp");
        writeContactChannelSelection(
          state,
          channelsPath,
          otherPath,
          whatsappPhonePath,
          s,
          onRefresh,
        );
        refreshNestedUi(waWrap, s.has("whatsapp"));
      });
      refreshNestedUi(waWrap, sel.has("whatsapp"));
      row.appendChild(inp);
      row.appendChild(document.createTextNode(opt.label));
      block.appendChild(row);
      block.appendChild(waWrap);
      root.appendChild(block);
      continue;
    }

    const row = el("label", FORM_CHECK_LABEL_CLASS);
    const inp = el("input", "size-4 rounded border-muted/40") as HTMLInputElement;
    inp.type = "checkbox";
    const sel = readContactChannelSelection(channelsPath, state);
    inp.checked = sel.has(opt.value);
    inp.addEventListener("change", () => {
      const s = readContactChannelSelection(channelsPath, state);
      if (inp.checked) s.add(opt.value);
      else s.delete(opt.value);
      writeContactChannelSelection(state, channelsPath, otherPath, whatsappPhonePath, s, onRefresh);
      inp.checked = s.has(opt.value);
    });
    row.appendChild(inp);
    row.appendChild(document.createTextNode(opt.label));
    root.appendChild(row);
  }

  attachClientConfigPath(root, channelsPath);
  return root;
}

function readSpecialtiesStringArray(path: string, state: Record<string, unknown>): string[] {
  const cur = getAt(state, path);
  if (!Array.isArray(cur)) return [];
  return cur
    .map((x) => (typeof x === "string" ? x : x == null ? "" : String(x)))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function readPresetSpecialtyMotifSelection(
  path: string,
  state: Record<string, unknown>,
): Set<string> {
  const arr = readSpecialtiesStringArray(path, state);
  return new Set(arr.filter((s) => SPECIALTY_MOTIF_LABEL_SET.has(s)));
}

function readCustomSpecialtyLines(path: string, state: Record<string, unknown>): string[] {
  return readSpecialtiesStringArray(path, state).filter((s) => !SPECIALTY_MOTIF_LABEL_SET.has(s));
}

function writePracticeSpecialtiesFromForm(
  state: Record<string, unknown>,
  path: string,
  presetSelected: Set<string>,
  customLines: string[],
  onRefresh: () => void,
): void {
  const ordered = SPECIALTY_MOTIF_ORDERED_LABELS.filter((l) => presetSelected.has(l));
  const customs = customLines.map((s) => s.trim()).filter((s) => s.length > 0);
  setAt(state, path, [...ordered, ...customs]);
  onRefresh();
}

/** Cases à cocher par section + zone libre pour motifs hors liste. */
function specialtiesMotifsCheckboxPanel(
  state: Record<string, unknown>,
  path: string,
  onRefresh: () => void,
): HTMLElement {
  const root = el("div", "space-y-3");
  root.setAttribute("role", "group");
  root.appendChild(
    el("p", "text-sm text-muted", undefined, [
      "Ouvrez les catégories qui vous concernent, puis cochez les motifs accompagnés. Plusieurs choix sont possibles.",
    ]),
  );

  const customTa = el("textarea", `${FORM_CONTROL_CLASS} min-h-20 resize-y`) as HTMLTextAreaElement;
  customTa.rows = 3;
  customTa.placeholder = "Autre spécialité ou motif de consultation, une entrée par ligne";
  customTa.value = readCustomSpecialtyLines(path, state).join("\n");

  for (const section of SPECIALTY_MOTIF_SECTIONS) {
    const block = el("details", "border-b border-muted/25 pb-3");
    block.open = section.items.some((label) =>
      readPresetSpecialtyMotifSelection(path, state).has(label),
    );
    const summary = el(
      "summary",
      "cursor-pointer py-2 text-sm font-semibold leading-relaxed text-fg",
    );
    summary.appendChild(document.createTextNode(section.title));
    const count = el("span", "ms-2 inline-block text-sm font-normal text-muted");
    const updateCount = () => {
      const selected = readPresetSpecialtyMotifSelection(path, state);
      const total = section.items.filter((label) => selected.has(label)).length;
      count.textContent =
        total > 0 ? `${total} sélectionné${total > 1 ? "s" : ""}` : `${section.items.length} choix`;
    };
    updateCount();
    summary.appendChild(count);
    block.appendChild(summary);
    const grid = el("div", "grid grid-cols-1 gap-1 pt-2 ps-4");
    for (const label of section.items) {
      const row = el(
        "label",
        "flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm leading-relaxed text-fg",
      );
      const inp = el(
        "input",
        "size-4 shrink-0 rounded border-muted/40 accent-primary",
      ) as HTMLInputElement;
      inp.type = "checkbox";
      inp.checked = readPresetSpecialtyMotifSelection(path, state).has(label);
      inp.addEventListener("change", () => {
        const s = readPresetSpecialtyMotifSelection(path, state);
        if (inp.checked) s.add(label);
        else s.delete(label);
        const raw = customTa.value
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        writePracticeSpecialtiesFromForm(state, path, s, raw, onRefresh);
        inp.checked = s.has(label);
        updateCount();
      });
      row.appendChild(inp);
      row.appendChild(el("span", "min-w-0", undefined, [label]));
      grid.appendChild(row);
    }
    block.appendChild(grid);
    root.appendChild(block);
  }

  const customWrap = el("div", "space-y-1 border-t border-muted/20 pt-4");
  const customLabelId = nextClientConfigFieldId("client-config-custom-motifs-label");
  customTa.id = nextClientConfigFieldId("client-config-field");
  customWrap.appendChild(
    el("label", "text-sm font-semibold text-fg", { id: customLabelId, htmlFor: customTa.id }, [
      "Autres motifs (hors liste, optionnel)",
    ]),
  );
  const syncCustom = () => {
    const raw = customTa.value
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const preset = readPresetSpecialtyMotifSelection(path, state);
    writePracticeSpecialtiesFromForm(state, path, preset, raw, onRefresh);
  };
  customTa.addEventListener("input", syncCustom);
  customTa.addEventListener("change", syncCustom);
  customWrap.appendChild(customTa);
  root.appendChild(customWrap);

  attachClientConfigPath(root, path);
  return root;
}

const PAYMENT_METHOD_PRESETS = [
  { value: "CB", label: "CB" },
  { value: "Virement", label: "Virement" },
  { value: "Chèque", label: "Chèque" },
  { value: "Espèces", label: "Espèces" },
] as const;

const PAYMENT_PRESET_ID_SET = new Set<string>(PAYMENT_METHOD_PRESETS.map((o) => o.value));

const UI_KEY_PAYMENT_AUTRE = "pricingPaymentAutreExpanded";

function readPaymentParts(state: Record<string, unknown>): { presets: Set<string>; other: string } {
  const cur = getAt(state, "pricing.payment");
  const arr = Array.isArray(cur) ? (cur as unknown[]) : [];
  const presets = new Set<string>();
  const others: string[] = [];
  for (const raw of arr) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t) continue;
    if (PAYMENT_PRESET_ID_SET.has(t)) presets.add(t);
    else others.push(t);
  }
  return { presets, other: others.join(", ") };
}

function getPaymentAutreExpanded(state: Record<string, unknown>): boolean {
  const { other } = readPaymentParts(state);
  const ui = state.__ui;
  if (ui && typeof ui === "object" && !Array.isArray(ui)) {
    const v = (ui as Record<string, unknown>)[UI_KEY_PAYMENT_AUTRE];
    if (typeof v === "boolean") return v;
  }
  return other.length > 0;
}

function setPaymentAutreExpanded(state: Record<string, unknown>, expanded: boolean): void {
  ensureRecord("__ui", state);
  (state.__ui as Record<string, unknown>)[UI_KEY_PAYMENT_AUTRE] = expanded;
}

function writePricingPaymentArray(
  state: Record<string, unknown>,
  presets: Set<string>,
  other: string,
): void {
  const includeOther = getPaymentAutreExpanded(state);
  const ordered: string[] = [];
  for (const o of PAYMENT_METHOD_PRESETS) {
    if (presets.has(o.value)) ordered.push(o.value);
  }
  if (includeOther) {
    const t = other.trim();
    if (t) ordered.push(t);
  }
  setAt(state, "pricing.payment", ordered);
}

function paymentMethodsCheckboxGroup(
  state: Record<string, unknown>,
  rerender: () => void,
): HTMLElement {
  const root = el("div", "space-y-2");
  attachClientConfigPath(root, "pricing.payment");
  const { presets, other } = readPaymentParts(state);
  const autreExpanded = getPaymentAutreExpanded(state);

  for (const opt of PAYMENT_METHOD_PRESETS) {
    const row = el("label", FORM_CHECK_LABEL_CLASS);
    const inp = el("input", "size-4 rounded border-muted/40") as HTMLInputElement;
    inp.type = "checkbox";
    inp.checked = presets.has(opt.value);
    inp.addEventListener("change", () => {
      const { presets: p, other: o } = readPaymentParts(state);
      if (inp.checked) p.add(opt.value);
      else p.delete(opt.value);
      writePricingPaymentArray(state, p, o);
      rerender();
    });
    row.appendChild(inp);
    row.appendChild(document.createTextNode(opt.label));
    root.appendChild(row);
  }

  const autreBlock = el("div", "space-y-2");
  const autreRow = el("label", FORM_CHECK_LABEL_CLASS);
  const autreInp = el(
    "input",
    "mt-0.5 size-4 shrink-0 rounded border-muted/40 accent-primary",
  ) as HTMLInputElement;
  autreInp.type = "checkbox";
  autreInp.checked = autreExpanded;
  const otherWrap = el("div", "ml-6 space-y-1.5");
  otherWrap.classList.toggle("hidden", !autreExpanded);
  const otherField = el("input", FORM_CONTROL_CLASS) as HTMLInputElement;
  otherField.type = "text";
  otherField.placeholder = "Autre moyen de paiement accepté";
  otherField.value = other;
  otherField.addEventListener("input", () => {
    const { presets: p } = readPaymentParts(state);
    writePricingPaymentArray(state, p, otherField.value);
  });
  attachClientConfigPath(otherField, "pricing.payment");

  autreInp.addEventListener("change", () => {
    if (autreInp.checked) {
      setPaymentAutreExpanded(state, true);
      const { presets: p, other: o } = readPaymentParts(state);
      writePricingPaymentArray(state, p, o);
    } else {
      setPaymentAutreExpanded(state, false);
      const { presets: p } = readPaymentParts(state);
      writePricingPaymentArray(state, p, "");
    }
    rerender();
  });

  autreRow.appendChild(autreInp);
  autreRow.appendChild(document.createTextNode("Autre, préciser"));
  autreBlock.appendChild(autreRow);
  otherWrap.appendChild(fieldWrap("Texte affiché sur la page Tarifs", otherField));
  autreBlock.appendChild(otherWrap);
  root.appendChild(autreBlock);

  return root;
}

function linesTextarea(
  state: Record<string, unknown>,
  path: string,
  onRefresh: () => void,
  rows = 5,
): HTMLTextAreaElement {
  const ta = el("textarea", `${FORM_CONTROL_CLASS} min-h-24 resize-y`) as HTMLTextAreaElement;
  ta.rows = rows;
  const cur = getAt(state, path);
  const lines = Array.isArray(cur) ? (cur as string[]).join("\n") : "";
  ta.placeholder = fieldPlaceholder(path);
  ta.value = lines;
  const sync = () => {
    const arr = ta.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    setAt(state, path, arr);
    onRefresh();
  };
  ta.addEventListener("input", sync);
  ta.addEventListener("change", sync);
  attachClientConfigPath(ta, path);
  return ta;
}

/** Envoi du JSON par e-mail via [Web3Forms](https://web3forms.com) (POST depuis le navigateur, sans serveur). */
export type ClientConfigWeb3FormsOptions = {
  accessKey: string;
};

export function mountClientConfigForm(
  root: HTMLElement,
  initial: Record<string, unknown>,
  options?: { web3forms?: ClientConfigWeb3FormsOptions },
): void {
  const state = migrateClientConfig(deepClone(initial)) as Record<string, unknown>;
  mergePracticePageEnabledDefaults(state);
  ensureRecord("business", state);
  ensureRecord("seo", state);
  ensureRecord("practice", state);
  ensureRecord("credentials", state);
  ensureRecord("conditions", state);
  ensureRecord("contact", state);
  ensureRecord("pricing", state);
  ensureArray("pricing.items", state);
  ensureRecord("aboutPage", state);
  ensureRecord("social", state);
  ensureArray("social.links", state);
  ensureRecord("practicePageEnabled", state);
  ensureRecord("practiceOfferCustomApproaches", state);
  mergePracticeOfferCustomApproachesDefaults(state);
  normalizeContactHoursInFormState(state);

  let activeTab: TabId = "business";
  const errorBox = el("div", "mb-6 hidden border-2 border-fg bg-bg p-4 text-sm text-fg", {
    role: "alert",
    tabindex: "-1",
  });
  const tabNav = el("nav", "grid grid-cols-2 gap-2 md:grid-cols-4", {
    "aria-label": "Sections du questionnaire",
  });
  const tabPanel = el("section", "min-h-96 py-6", { tabindex: "-1" });
  const stepNav = el("div", "mb-2 flex flex-wrap items-center justify-between gap-3");
  let displayedErrors: { path: string; errorId: string }[] = [];

  function focusField(path: string): void {
    const target = tabPanel.querySelector<HTMLElement>(`[data-config-path="${CSS.escape(path)}"]`);
    const control = target?.matches("input, select, textarea")
      ? target
      : target?.querySelector<HTMLElement>("input, select, textarea, button");
    (control ?? errorBox).focus();
    (control ?? errorBox).scrollIntoView({ block: "center", behavior: "instant" });
  }

  function showErrors(issues: ClientValidationIssue[]): void {
    clearClientConfigFieldHighlights(root);
    const firstTab = issues.find((i) => i.tabId != null)?.tabId;
    if (firstTab != null && firstTab !== activeTab) {
      activeTab = firstTab;
      renderTabNav();
      renderTabPanel();
      renderStepNav();
    }
    errorBox.classList.remove("hidden");
    errorBox.replaceChildren();
    errorBox.appendChild(
      el("p", "mb-1 font-semibold text-fg", undefined, [
        `${issues.length} erreur${issues.length > 1 ? "s" : ""} à corriger`,
      ]),
    );
    errorBox.appendChild(
      el("p", "mb-4 text-sm text-fg", undefined, [
        "Sélectionnez une erreur pour accéder au champ à corriger.",
      ]),
    );
    const ul = el("ul", "space-y-2");
    const errorPaths: { path: string; errorId: string }[] = [];
    for (const i of issues) {
      const li = el("li", "rounded-xl border border-red-200 bg-bg px-3.5 py-2.5");
      const errorId = nextClientConfigFieldId("client-config-error");
      const message = el(
        "button",
        "text-left text-sm leading-relaxed text-fg underline underline-offset-4",
        {
          id: errorId,
          type: "button",
        },
        [i.summary],
      );
      message.addEventListener("click", () => {
        if (i.tabId) setActiveTab(i.tabId);
        focusField(i.path);
      });
      li.appendChild(message);
      if (i.path !== "root") errorPaths.push({ path: i.path, errorId });
      ul.appendChild(li);
    }
    errorBox.appendChild(ul);
    displayedErrors = errorPaths;
    highlightClientConfigFieldsForPaths(tabPanel, errorPaths);
    requestAnimationFrame(() => {
      const invalid = tabPanel.querySelector<HTMLElement>(
        'input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"], [role="group"][aria-invalid="true"]',
      );
      const focusTarget =
        invalid?.getAttribute("role") === "group"
          ? invalid.querySelector<HTMLElement>("input, select, textarea")
          : invalid;
      const scrollTarget = focusTarget ?? invalid ?? errorBox;
      scrollTarget.scrollIntoView({
        block: "nearest",
        behavior: "instant",
      });
      focusTarget?.focus({ preventScroll: true });
      if (!focusTarget) errorBox.focus({ preventScroll: true });
    });
  }

  function clearErrors(): void {
    displayedErrors = [];
    errorBox.classList.add("hidden");
    errorBox.replaceChildren();
    clearClientConfigFieldHighlights(root);
  }

  function setActiveTab(id: TabId): void {
    activeTab = id;
    renderTabNav();
    renderTabPanel();
    renderStepNav();
    tabPanel.focus({ preventScroll: true });
    tabPanel.scrollIntoView({ block: "start", behavior: "instant" });
  }

  function renderTabNav(): void {
    tabNav.replaceChildren();
    TABS.forEach((t, index) => {
      const active = activeTab === t.id;
      const btn = el(
        "button",
        `inline-flex min-h-11 items-center gap-2 rounded border px-3 py-2 text-left text-sm text-fg ${
          active
            ? "border-fg bg-bg underline underline-offset-4"
            : "border-muted/40 bg-bg hover:underline"
        }`,
        { type: "button", "aria-current": active ? "step" : "false" },
      );
      btn.appendChild(
        el(
          "span",
          "flex size-6 shrink-0 items-center justify-center text-xs font-semibold tabular-nums",
          undefined,
          [String(index + 1)],
        ),
      );
      btn.appendChild(el("span", "font-medium", undefined, [t.label]));
      btn.addEventListener("click", () => setActiveTab(t.id));
      tabNav.appendChild(btn);
    });
  }

  function renderStepNav(): void {
    stepNav.replaceChildren();
    const idx = TABS.findIndex((t) => t.id === activeTab);
    const prev = idx > 0 ? TABS[idx - 1] : null;
    const next = idx >= 0 && idx < TABS.length - 1 ? TABS[idx + 1] : null;

    const left = el("div", "");
    if (prev) {
      const b = el(
        "button",
        "rounded-xl border border-muted/25 bg-bg px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:bg-accent/50",
        { type: "button" },
        [`← ${prev.label}`],
      );
      b.addEventListener("click", () => setActiveTab(prev.id));
      left.appendChild(b);
    }
    stepNav.appendChild(left);

    stepNav.appendChild(
      el("p", "text-sm text-muted", undefined, [`Étape ${idx + 1} sur ${TABS.length}`]),
    );

    const right = el("div", "");
    if (next) {
      const b = el(
        "button",
        "rounded-xl border border-muted/25 bg-bg px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:bg-accent/50",
        { type: "button" },
        [`${next.label} →`],
      );
      b.addEventListener("click", () => setActiveTab(next.id));
      right.appendChild(b);
    }
    stepNav.appendChild(right);
  }

  function renderTabPanel(): void {
    tabPanel.replaceChildren();
    const inner = renderActivePanel();
    tabPanel.appendChild(inner);
    tabPanel.setAttribute("aria-label", TABS.find((tab) => tab.id === activeTab)!.label);
    highlightClientConfigFieldsForPaths(tabPanel, displayedErrors);
  }

  function onRefresh(): void {
    /* champs simples : pas de re-render complet */
  }

  function renderActivePanel(): HTMLElement {
    const box = el("div", "max-w-4xl space-y-5");
    switch (activeTab) {
      case "business":
        return renderBusiness(box, state, onRefresh, () => {
          renderTabPanel();
        });
      case "practice":
        return renderPractice(box, state, onRefresh);
      case "optional":
        return renderOptional(box, state, onRefresh, () => {
          renderTabPanel();
        });
      case "cabinet":
        return renderCabinet(box, state, () => {
          renderTabPanel();
        });
      default: {
        const _e: never = activeTab;
        return _e;
      }
    }
  }

  const toolbar = el("div", "sticky bottom-0 z-40 border-t border-muted/25 bg-bg");
  const toolbarInner = el("div", "flex flex-wrap items-center justify-between gap-3 py-3");
  const toolbarHint = el("p", "hidden text-sm text-muted sm:block", undefined, [
    "Complétez chaque onglet, puis téléchargez une copie de vos réponses.",
  ]);
  const toolbarActions = el("div", "flex flex-wrap items-center gap-2");
  const submissionStatus = el("p", "max-w-4xl text-sm text-fg", { role: "status" });
  const btnDl = el(
    "button",
    "rounded-xl border border-muted/25 bg-bg px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-accent/50 hover:text-fg",
    { type: "button" },
    ["Télécharger une copie"],
  );
  const web3 = options?.web3forms;
  const btnMail =
    web3 && web3.accessKey
      ? el(
          "button",
          "min-h-11 rounded border border-fg bg-bg px-5 py-2.5 text-sm font-semibold text-fg hover:underline disabled:cursor-wait",
          { type: "button" },
          ["Envoyer mes réponses"],
        )
      : null;
  const submissionInstructions = btnMail
    ? "Complétez chaque onglet, puis choisissez « Envoyer mes réponses » ou « Télécharger une copie » une fois le formulaire terminé."
    : "Complétez chaque onglet, téléchargez une copie de vos réponses, puis transmettez-la à la personne qui prépare votre site.";
  toolbarHint.textContent = btnMail
    ? "Envoyez vos réponses ou téléchargez une copie une fois le formulaire terminé."
    : "Téléchargez une copie de vos réponses une fois le formulaire terminé.";

  btnDl.addEventListener("click", () => {
    mergePracticePageEnabledDefaults(state);
    mergePracticeOfferCustomApproachesDefaults(state);
    const r = validateClientJsonRaw(state);
    if (!r.ok) {
      showErrors(r.issues);
      return;
    }
    clearErrors();
    const blob = new Blob([JSON.stringify(r.data, null, 4)], {
      type: "application/json;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reponses-site.json";
    a.click();
    URL.revokeObjectURL(a.href);
    submissionStatus.textContent =
      "Copie préparée : retrouvez reponses-site.json dans vos téléchargements et transmettez-le à la personne qui prépare votre site.";
  });

  if (btnMail && web3) {
    btnMail.addEventListener("click", async () => {
      mergePracticePageEnabledDefaults(state);
      mergePracticeOfferCustomApproachesDefaults(state);
      const r = validateClientJsonRaw(state);
      if (!r.ok) {
        showErrors(r.issues);
        return;
      }
      clearErrors();
      btnMail.disabled = true;
      btnMail.textContent = "Envoi en cours…";
      submissionStatus.textContent = "Envoi de vos réponses en cours…";
      try {
        const jsonText = JSON.stringify(r.data, null, 4);
        const res = await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            access_key: web3.accessKey,
            subject: `Réponses questionnaire site — ${new Date().toISOString()}`,
            from_name: "Questionnaire contenu du site",
            message: `Contenu du fichier client.json à copier dans src/data/client.json :\n\n${jsonText}`,
          }),
        });
        const data = (await res.json()) as { success?: boolean; message?: string };
        if (!res.ok || !data.success) {
          submissionStatus.textContent = `L’envoi a échoué : ${data.message ?? res.statusText}. Réessayez ou utilisez « Télécharger une copie » pour transmettre le fichier.`;
          return;
        }
        submissionStatus.textContent = "Vos réponses ont été envoyées.";
      } catch {
        submissionStatus.textContent =
          "L’envoi a échoué. Vérifiez votre connexion et réessayez, ou utilisez « Télécharger une copie » pour transmettre le fichier.";
      } finally {
        btnMail.disabled = false;
        btnMail.textContent = "Envoyer mes réponses";
      }
    });
  }

  if (btnMail) {
    toolbarActions.appendChild(btnMail);
  }
  toolbarActions.appendChild(btnDl);
  toolbarInner.appendChild(toolbarHint);
  toolbarInner.appendChild(toolbarActions);
  toolbar.appendChild(toolbarInner);

  const instructions = document.getElementById("client-config-instructions");
  if (instructions) instructions.textContent = submissionInstructions;

  const tabsShell = el("div", "mb-2 max-w-4xl space-y-3");
  tabsShell.appendChild(tabNav);

  root.appendChild(errorBox);
  root.appendChild(tabsShell);
  root.appendChild(tabPanel);
  root.appendChild(stepNav);
  root.appendChild(submissionStatus);
  root.appendChild(toolbar);

  renderTabNav();
  renderTabPanel();
  renderStepNav();
}

function renderBusiness(
  box: HTMLElement,
  state: Record<string, unknown>,
  onRefresh: () => void,
  rerender: () => void,
): HTMLElement {
  const p = "business";
  ensureRecord("credentials", state);
  ensureRecord("credentials.license", state);
  ensureRecord("aboutPage", state);

  const professionPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  professionPanel.appendChild(
    fieldWrap(
      "Métier exercé",
      selectLabeled(state, "profession", PROFESSION_FORM_OPTIONS, () => {
        if (getAt(state, "profession") === "psychomotricien") {
          setAt(state, "practice.reimbursement.monSoutienPsy.enabled", false);
        }
        onRefresh();
        rerender();
      }),
    ),
  );
  box.appendChild(professionPanel);

  const identityPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  identityPanel.appendChild(fieldWrap("Nom complet", textInput(state, `${p}.fullName`, onRefresh)));
  identityPanel.appendChild(
    fieldWrap("Présentation", textareaInput(state, "aboutPage.intro", onRefresh, 8)),
  );
  identityPanel.appendChild(
    desktopFieldGrid(
      2,
      fieldWrap("Titre professionnel", textInput(state, `${p}.title`, onRefresh)),
      fieldWrap("Email professionnel", textInput(state, `${p}.email`, onRefresh)),
    ),
  );
  const regNumberInputId = nextClientConfigFieldId("client-config-registration-number");
  const regNumberLabel = el("label", FORM_LABEL_CLASS, { htmlFor: regNumberInputId });
  const syncRegNumberLabel = () => {
    const registration = getAt(state, "credentials.license.registrationLabel");
    regNumberLabel.textContent =
      registration === "rpps"
        ? "N° RPPS"
        : registration === "adeli"
          ? "N° ADELI"
          : "N° ADELI / RPPS";
  };
  syncRegNumberLabel();
  identityPanel.appendChild(
    registrationLabelRadioGroup(
      state,
      "credentials.license.registrationLabel",
      onRefresh,
      syncRegNumberLabel,
    ),
  );
  const rppsOrAdeliPending = Boolean(getAt(state, "credentials.license.rppsOrAdeliPending"));
  const onRppsOrAdeliPendingChange = () => {
    if (getAt(state, "credentials.license.rppsOrAdeliPending")) {
      setAt(state, "credentials.license.rppsOrAdeli", "");
    }
    rerender();
  };
  const regNumBlock = el("div", "space-y-1.5");
  regNumBlock.appendChild(regNumberLabel);
  const regNumberInput = textInput(state, "credentials.license.rppsOrAdeli", onRefresh, {
    disabled: rppsOrAdeliPending,
  });
  regNumberInput.id = regNumberInputId;
  regNumBlock.appendChild(regNumberInput);
  regNumBlock.appendChild(
    checkboxInput(
      state,
      "credentials.license.rppsOrAdeliPending",
      onRppsOrAdeliPendingChange,
      "Je n’ai pas encore de numéro ADELI/RPPS",
    ),
  );

  const siretPending = Boolean(getAt(state, `${p}.siretPending`));
  const onSiretPendingChange = () => {
    if (getAt(state, `${p}.siretPending`)) {
      setAt(state, `${p}.siret`, "");
    }
    rerender();
  };
  const siretBlock = fieldWrap(
    "N° SIRET",
    textInput(state, `${p}.siret`, onRefresh, { disabled: siretPending }),
  );
  siretBlock.appendChild(
    checkboxInput(
      state,
      `${p}.siretPending`,
      onSiretPendingChange,
      "Je n’ai pas encore de numéro SIRET",
    ),
  );

  identityPanel.appendChild(desktopFieldGrid(2, regNumBlock, siretBlock));
  box.appendChild(identityPanel);

  const addressPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  addressPanel.appendChild(sectionHeading("Adresse et téléphone"));
  const addressPending = Boolean(getAt(state, `${p}.addressPending`));
  addressPanel.appendChild(
    checkboxInput(
      state,
      `${p}.addressPending`,
      () => {
        if (getAt(state, `${p}.addressPending`)) {
          for (const field of ["city", "postalCode", "addressLine1", "addressLine2"]) {
            setAt(state, `${p}.${field}`, "");
          }
        }
        const formRoot = box.closest("#client-config-root");
        rerender();
        formRoot
          ?.querySelector<HTMLInputElement>('[data-config-path="business.addressPending"] input')
          ?.focus({ preventScroll: true });
      },
      "Je n’ai pas encore d’adresse de cabinet",
    ),
  );
  if (addressPending) {
    addressPanel.appendChild(
      el("p", "text-sm text-muted", undefined, [
        "L’adresse pourra être complétée plus tard. Renseignez votre téléphone pour pouvoir être contacté.",
      ]),
    );
  }
  addressPanel.appendChild(
    desktopFieldGrid(
      2,
      fieldWrap("Ville", textInput(state, `${p}.city`, onRefresh, { disabled: addressPending })),
      fieldWrap(
        "Code postal",
        textInput(state, `${p}.postalCode`, onRefresh, { disabled: addressPending }),
      ),
    ),
  );
  addressPanel.appendChild(
    fieldWrap(
      "Adresse",
      textInput(state, `${p}.addressLine1`, onRefresh, { disabled: addressPending }),
    ),
  );
  addressPanel.appendChild(
    fieldWrap(
      "Complément d’adresse (optionnel)",
      textInput(state, `${p}.addressLine2`, onRefresh, {
        placeholder: "Bâtiment, étage, digicode…",
        disabled: addressPending,
      }),
    ),
  );
  addressPanel.appendChild(fieldWrap("Téléphone", textInput(state, `${p}.phone`, onRefresh)));
  box.appendChild(addressPanel);

  const experiencePanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  experiencePanel.appendChild(sectionHeading("Parcours professionnel"));
  experiencePanel.appendChild(
    fieldWrap(
      "Années d’expérience (optionnel)",
      numberInput(state, "credentials.experienceYears", onRefresh, 0, 80),
    ),
  );
  experiencePanel.appendChild(
    el("p", "text-sm text-muted", undefined, [
      "Ajoutez les expériences professionnelles que vous souhaitez présenter sur votre site.",
    ]),
  );
  experiencePanel.appendChild(
    renderCredList(state, "credentials.experiences", rerender, {
      addLabel: "+ Ajouter une expérience professionnelle",
      itemLabel: "Expérience professionnelle",
      fields: [
        { key: "label", label: "Poste / fonction" },
        { key: "organization", label: "Structure / établissement (optionnel)" },
        { key: "period", label: "Période (optionnel, ex. 2020 – aujourd’hui)" },
      ],
      defaultNew: { label: "", organization: "", period: "" },
    }),
  );
  box.appendChild(experiencePanel);

  const degreesPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  degreesPanel.appendChild(sectionHeading("Diplômes"));
  degreesPanel.appendChild(
    renderCredList(state, "credentials.degrees", rerender, {
      addLabel: "+ Ajouter un diplôme",
      fields: [
        { key: "label", label: "Intitulé du diplôme" },
        { key: "institution", label: "Établissement (optionnel)" },
        { key: "year", label: "Année (optionnel)" },
      ],
      defaultNew: { label: "", institution: "", year: "" },
    }),
  );
  box.appendChild(degreesPanel);

  const trainingsPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  trainingsPanel.appendChild(sectionHeading("Formations continues"));
  trainingsPanel.appendChild(
    renderCredList(state, "credentials.trainings", rerender, {
      addLabel: "+ Ajouter une formation",
      fields: [
        { key: "label", label: "Intitulé de la formation" },
        { key: "provider", label: "Organisme (optionnel)" },
        { key: "year", label: "Année (optionnel)" },
      ],
      defaultNew: { label: "", provider: "", year: "" },
    }),
  );
  box.appendChild(trainingsPanel);

  const affiliationsPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  affiliationsPanel.appendChild(
    fieldWrap(
      "Affiliations professionnelles (une par ligne)",
      linesTextarea(state, "credentials.affiliations", onRefresh, 4),
      FORM_SECTION_TITLE_CLASS,
    ),
  );
  box.appendChild(affiliationsPanel);

  ensureRecord("social", state);
  ensureArray("social.links", state);
  const socialPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  socialPanel.appendChild(sectionHeading("Réseaux sociaux (optionnel)"));
  socialPanel.appendChild(
    el("p", "text-sm text-muted", undefined, [
      "Un ou deux liens suffisent (ex. LinkedIn). Affichés en pied de page.",
    ]),
  );
  socialPanel.appendChild(
    renderCredList(state, "social.links", rerender, {
      addLabel: "+ Ajouter un lien",
      fields: [
        { key: "label", label: "Libellé" },
        { key: "href", label: "URL" },
      ],
      defaultNew: { label: "", href: "" },
    }),
  );
  box.appendChild(socialPanel);

  return box;
}

function renderPractice(
  box: HTMLElement,
  state: Record<string, unknown>,
  onRefresh: () => void,
): HTMLElement {
  const p = "practice";
  const audiencePanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  audiencePanel.appendChild(
    fieldWrap(
      "Public accompagné",
      audienceCheckboxGroup(state, `${p}.audience`, `${p}.audienceOther`, onRefresh),
    ),
  );
  box.appendChild(audiencePanel);

  const specialtiesPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  const specialtiesLabelId = nextClientConfigFieldId("client-config-specialties-label");
  specialtiesPanel.appendChild(
    el("p", FORM_LABEL_CLASS, { id: specialtiesLabelId }, ["Spécialités ou motifs fréquents"]),
  );
  const specialtiesGroup = specialtiesMotifsCheckboxPanel(state, `${p}.specialties`, onRefresh);
  specialtiesGroup.setAttribute("aria-labelledby", specialtiesLabelId);
  specialtiesPanel.appendChild(specialtiesGroup);
  box.appendChild(specialtiesPanel);

  const languagesPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  languagesPanel.appendChild(
    fieldWrap(
      "Langues parlées en consultation (une par ligne)",
      linesTextarea(state, `${p}.languages`, onRefresh),
    ),
  );
  box.appendChild(languagesPanel);

  const showMonSoutienPsy = getAt(state, "profession") === "psychologue";
  if (showMonSoutienPsy) {
    const reimbursementPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
    reimbursementPanel.appendChild(sectionHeading("Remboursement"));
    reimbursementPanel.appendChild(
      checkboxInput(
        state,
        `${p}.reimbursement.monSoutienPsy.enabled`,
        onRefresh,
        "Proposer le dispositif « Mon soutien psy »",
      ),
    );
    reimbursementPanel.appendChild(
      fieldWrap(
        "Texte affiché aux patients (optionnel)",
        textareaInput(state, `${p}.reimbursement.monSoutienPsy.note`, onRefresh),
      ),
    );
    box.appendChild(reimbursementPanel);
  }
  return box;
}

function renderOptionalFamilyOtherList(
  state: Record<string, unknown>,
  familyId: string,
  rerender: () => void,
): HTMLElement {
  const basePath = `practiceOfferCustomApproaches.${familyId}`;
  const arr = ensureArray(basePath, state) as string[];
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== "string") arr[i] = arr[i] == null ? "" : String(arr[i]);
  }

  const wrap = el("div", "space-y-2");
  const add = el("button", FORM_BTN_SECONDARY_CLASS, { type: "button" }, ["Ajouter"]);
  add.addEventListener("click", () => {
    arr.push("");
    rerender();
  });
  wrap.appendChild(add);

  arr.forEach((_, i) => {
    const row = el("div", "flex flex-wrap items-center gap-2");
    const inp = textInput(state, `${basePath}.${i}`, () => {}, {
      placeholder: "Approche ou précision",
      textClass: PRACTICE_OFFER_FORM_TEXT_CLASS,
    });
    inp.setAttribute("aria-label", `Autre approche ${i + 1}`);
    inp.classList.add("min-w-0", "flex-1");
    row.appendChild(inp);
    const rm = el("button", `shrink-0 ${FORM_BTN_DANGER_CLASS}`, { type: "button" }, ["Retirer"]);
    rm.addEventListener("click", () => {
      if (!confirmRemove(arr[i])) return;
      arr.splice(i, 1);
      rerender();
    });
    row.appendChild(rm);
    wrap.appendChild(row);
  });

  return wrap;
}

function renderOptional(
  box: HTMLElement,
  state: Record<string, unknown>,
  onRefresh: () => void,
  rerender: () => void,
): HTMLElement {
  const pageById = new Map(REGISTERED_PRACTICE_PAGES.map((t) => [t.id, t] as const));
  for (const family of PRACTICE_OFFER_FORM_FAMILIES) {
    const practicePagesInFamily = family.practicePageIds
      .map((id) => pageById.get(id))
      .filter((t): t is NonNullable<typeof t> => t != null)
      .sort((a, b) => a.navLabel.localeCompare(b.navLabel, "fr"));
    if (practicePagesInFamily.length === 0) continue;
    const section = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
    section.appendChild(sectionHeading(family.label));
    const grid = el("div", "grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3");
    for (const p of practicePagesInFamily) {
      const cell = el("div", "min-w-0");
      cell.appendChild(
        checkboxInput(
          state,
          `practicePageEnabled.${p.id}`,
          onRefresh,
          p.navLabel,
          PRACTICE_OFFER_FORM_CHECK_CLASS,
        ),
      );
      grid.appendChild(cell);
    }
    section.appendChild(grid);
    const otherWrap = el("div", "mt-8 border-t border-muted/20 pt-6");
    otherWrap.appendChild(
      fieldWrap(
        "Autres approches (optionnel)",
        renderOptionalFamilyOtherList(state, family.id, rerender),
        PRACTICE_OFFER_FORM_LABEL_CLASS,
      ),
    );
    section.appendChild(otherWrap);
    box.appendChild(section);
  }
  return box;
}

type CredListField = { key: string; label: string };

function renderCredList(
  state: Record<string, unknown>,
  basePath: string,
  rerender: () => void,
  opts: {
    addLabel: string;
    itemLabel?: string;
    fields: CredListField[];
    defaultNew: Record<string, string>;
  },
): HTMLElement {
  const arr = ensureArray(basePath, state) as Record<string, string>[];
  const add = el("button", `mb-2 ${FORM_BTN_SECONDARY_CLASS}`, { type: "button" }, [opts.addLabel]);
  add.addEventListener("click", () => {
    const formRoot = wrap.closest("#client-config-root");
    const index = arr.length;
    arr.push({ ...opts.defaultNew });
    rerender();
    formRoot
      ?.querySelector<HTMLInputElement>(
        `[data-config-path="${basePath}.${index}.${opts.fields[0]!.key}"]`,
      )
      ?.focus();
  });
  const wrap = el("div", "space-y-3");
  attachClientConfigPath(wrap, basePath);
  wrap.appendChild(add);
  arr.forEach((_, i) => {
    const card = el("div", "space-y-3 border border-muted/25 p-4");
    if (opts.itemLabel) {
      card.setAttribute("role", "group");
      card.setAttribute("aria-label", `${opts.itemLabel} ${i + 1}`);
    }
    const grid = desktopFieldGrid(
      3,
      ...opts.fields.map((f) =>
        fieldWrap(
          f.label,
          textInput(state, `${basePath}.${i}.${f.key}`, () => {}),
        ),
      ),
    );
    card.appendChild(grid);
    const rm = el("button", FORM_BTN_DANGER_CLASS, { type: "button" }, ["Supprimer"]);
    if (opts.itemLabel) rm.setAttribute("aria-label", `Supprimer : ${opts.itemLabel} ${i + 1}`);
    rm.addEventListener("click", () => {
      if (!confirmRemove(arr[i])) return;
      const formRoot = wrap.closest("#client-config-root");
      arr.splice(i, 1);
      rerender();
      const nextIndex = Math.min(i, arr.length - 1);
      const focusTarget =
        nextIndex >= 0
          ? `[data-config-path="${basePath}.${nextIndex}.${opts.fields[0]!.key}"]`
          : `[data-config-path="${basePath}"] button`;
      formRoot?.querySelector<HTMLElement>(focusTarget)?.focus();
    });
    card.appendChild(rm);
    wrap.appendChild(card);
  });
  return wrap;
}

function renderCabinet(
  box: HTMLElement,
  state: Record<string, unknown>,
  rerender: () => void,
): HTMLElement {
  normalizeContactHoursInFormState(state);
  ensureRecord("contact.channels", state);
  ensureRecord("conditions", state);
  const condRefresh = () => {
    /* champs simples */
  };

  const consultationPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  consultationPanel.appendChild(
    fieldWrap(
      "Modes de consultation",
      consultationModesCheckboxGroup(state, "practice.consultationModes", condRefresh),
    ),
  );
  box.appendChild(consultationPanel);

  const hoursPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  hoursPanel.appendChild(sectionHeading("Horaires (par jour)"));
  const hoursGrid = el("div", "grid gap-3 md:grid-cols-2 lg:grid-cols-3");
  for (const day of CONTACT_HOURS_WEEKDAY_ORDER) {
    const dayBox = el("div", "space-y-2 border border-muted/25 p-4");
    dayBox.appendChild(
      checkboxInput(
        state,
        `contact.hours.${day}.enabled`,
        rerender,
        CONTACT_HOURS_WEEKDAY_LABELS[day],
      ),
    );
    if (Boolean(getAt(state, `contact.hours.${day}.enabled`))) {
      dayBox.appendChild(
        fieldWrap(
          "Horaires (ex. 9h – 19h)",
          textInput(state, `contact.hours.${day}.value`, () => {}),
        ),
      );
    }
    hoursGrid.appendChild(dayBox);
  }
  hoursPanel.appendChild(hoursGrid);
  box.appendChild(hoursPanel);

  const contactChannelsPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  contactChannelsPanel.appendChild(sectionHeading("Contact en ligne"));
  contactChannelsPanel.appendChild(
    el("p", "text-sm text-muted", undefined, [
      "Comment souhaitez-vous être contacté(e) par vos patients ?",
    ]),
  );
  contactChannelsPanel.appendChild(
    fieldWrap(
      "Lien de prise de rendez-vous (Doctolib ou autre)",
      textInput(state, "contact.bookingUrl", condRefresh, "https://exemple.fr/prendre-rendez-vous"),
    ),
  );
  contactChannelsPanel.appendChild(
    el("p", "text-sm text-muted", undefined, [
      "Utilisé pour le bouton « Prendre rendez-vous ». Obligatoire si le canal Doctolib est coché.",
    ]),
  );
  contactChannelsPanel.appendChild(
    contactChannelsCheckboxGroup(
      state,
      "contact.channels.selected",
      "contact.channels.other",
      "contact.channels.whatsappPhone",
      condRefresh,
    ),
  );
  box.appendChild(contactChannelsPanel);

  const accessPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  accessPanel.appendChild(sectionHeading("Accès au cabinet (optionnel)"));
  accessPanel.appendChild(
    fieldWrap(
      "Comment venir / accessibilité",
      textareaInput(state, "contact.accessNote", condRefresh, 3),
    ),
  );
  accessPanel.appendChild(
    el("p", "text-sm text-muted", undefined, [
      "Ex. parking, métro, ascenseur, accès PMR, digicode…",
    ]),
  );
  box.appendChild(accessPanel);

  const c = "conditions";

  const pricingPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  attachClientConfigPath(pricingPanel, "pricing.items");
  pricingPanel.appendChild(sectionHeading("Tarifs"));
  pricingPanel.appendChild(
    el("p", "text-sm text-muted", undefined, [
      "Indiquez vos prestations. Au moins une est nécessaire.",
    ]),
  );
  const items = ensureArray("pricing.items", state) as {
    name?: string;
    price?: number;
    durationMinutes?: number;
    note?: string;
  }[];
  const add = el("button", `mb-4 ${FORM_BTN_SECONDARY_CLASS}`, { type: "button" }, [
    "+ Ajouter une prestation",
  ]);
  add.addEventListener("click", () => {
    const formRoot = pricingPanel.closest("#client-config-root");
    const index = items.length;
    items.push({ name: "", note: "" });
    rerender();
    formRoot
      ?.querySelector<HTMLInputElement>(`[data-config-path="pricing.items.${index}.name"]`)
      ?.focus();
  });
  pricingPanel.appendChild(add);
  items.forEach((_, i) => {
    const card = el("div", "space-y-3 border border-muted/25 p-4");
    card.appendChild(
      desktopFieldGrid(
        3,
        fieldWrap(
          "Libellé",
          textInput(state, `pricing.items.${i}.name`, () => {}),
        ),
        fieldWrap(
          "Prix (€)",
          numberInput(state, `pricing.items.${i}.price`, () => {}, 0),
        ),
        fieldWrap(
          "Durée (minutes)",
          numberInput(state, `pricing.items.${i}.durationMinutes`, () => {}, 20, 180),
        ),
      ),
    );
    card.appendChild(
      fieldWrap(
        "Précision (optionnel)",
        textInput(state, `pricing.items.${i}.note`, () => {}),
      ),
    );
    const rm = el("button", FORM_BTN_DANGER_CLASS, { type: "button" }, ["Supprimer"]);
    rm.disabled = items.length <= 1;
    rm.title = items.length <= 1 ? "Conservez au moins une prestation." : "";
    rm.addEventListener("click", () => {
      if (items.length <= 1) return;
      if (!confirmRemove(items[i])) return;
      items.splice(i, 1);
      rerender();
    });
    card.appendChild(rm);
    pricingPanel.appendChild(card);
  });
  pricingPanel.appendChild(
    fieldWrap(
      "Tarif adapté / situations particulières (optionnel)",
      textareaInput(state, "pricing.reducedRateNote", condRefresh, 2),
    ),
  );
  pricingPanel.appendChild(
    el("p", "text-sm text-muted", undefined, [
      "Ex. « Un tarif adapté peut être envisagé pour les étudiants ou selon la situation. »",
    ]),
  );
  box.appendChild(pricingPanel);

  const conditionsPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  conditionsPanel.appendChild(sectionHeading("Annulation"));
  conditionsPanel.appendChild(
    fieldWrap(
      "Délai d’annulation (heures avant la séance)",
      numberInput(state, `${c}.cancellation.noticeHours`, condRefresh, 0, 168),
    ),
  );
  conditionsPanel.appendChild(
    fieldWrap(
      "Politique d’annulation",
      textareaInput(state, `${c}.cancellation.feePolicy`, condRefresh),
    ),
  );
  conditionsPanel.appendChild(sectionHeading("Retard"));
  conditionsPanel.appendChild(
    fieldWrap(
      "Tolérance de retard (minutes)",
      numberInput(state, `${c}.delay.graceMinutes`, condRefresh, 0, 60),
    ),
  );
  conditionsPanel.appendChild(
    fieldWrap("Texte sur le retard", textareaInput(state, `${c}.delay.note`, condRefresh)),
  );
  conditionsPanel.appendChild(sectionHeading("Absence non signalée"));
  conditionsPanel.appendChild(
    checkboxInput(state, `${c}.noShow.charged`, condRefresh, "Facturer l’absence non signalée"),
  );
  conditionsPanel.appendChild(
    fieldWrap("Texte sur l’absence", textareaInput(state, `${c}.noShow.note`, condRefresh)),
  );
  box.appendChild(conditionsPanel);

  const paymentPanel = el("div", `${FORM_SECTION_PANEL_CLASS} space-y-4`);
  paymentPanel.appendChild(sectionHeading("Moyens de paiement acceptés"));
  paymentPanel.appendChild(
    el("p", "text-sm text-muted", undefined, [
      "Cochez au moins un moyen : la page Tarifs l’affiche aux patients.",
    ]),
  );
  paymentPanel.appendChild(paymentMethodsCheckboxGroup(state, rerender));
  box.appendChild(paymentPanel);
  return box;
}
