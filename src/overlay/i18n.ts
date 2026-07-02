import { listen } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import overlayEn from "../locales/en/overlay.json";
import overlayZh from "../locales/zh/overlay.json";

type LocaleTree = typeof overlayEn;

const LOCALES: Record<string, LocaleTree> = {
  en: overlayEn,
  zh: overlayZh,
};

console.log("[overlay-i18n] module evaluated");

function resolveKey(tree: LocaleTree, path: string): string | null {
  const parts = path.split(".");
  let node: unknown = tree;
  for (const part of parts) {
    if (node && typeof node === "object" && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return typeof node === "string" ? node : null;
}

async function detectLanguage(): Promise<string> {
  try {
    const store = new LazyStore("settings.json");
    const settings = await store.get<{ language?: string }>("settings");
    const lang = settings?.language;
    if (lang === "en" || lang === "zh") {
      console.log(`[overlay-i18n] language from store: ${lang}`);
      return lang;
    }
    console.log(`[overlay-i18n] store language missing/invalid: ${String(lang)}`);
  } catch (e) {
    console.log(`[overlay-i18n] store read failed: ${String(e)}`);
  }
  const nav = (
    (navigator.languages && navigator.languages[0]) ||
    navigator.language ||
    "en"
  ).toLowerCase();
  const fallback = nav.startsWith("zh") ? "zh" : "en";
  console.log(`[overlay-i18n] navigator fallback: ${fallback}`);
  return fallback;
}

function applyTranslations(lang: string): void {
  const tree = LOCALES[lang] ?? LOCALES.en;
  const nodes = document.querySelectorAll<HTMLElement>("[data-i18n]");
  let count = 0;
  nodes.forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const value = resolveKey(tree, key);
    if (value !== null) {
      el.textContent = value;
      count += 1;
    } else {
      console.warn(`[overlay-i18n] missing key: ${key} for lang ${lang}`);
    }
  });
  console.log(`[overlay-i18n] applied ${count} translations for ${lang}`);
}

async function main(): Promise<void> {
  const lang = await detectLanguage();
  applyTranslations(lang);
  try {
    await listen<{ language?: string }>("language-changed", (event) => {
      const next = event.payload?.language;
      console.log(`[overlay-i18n] language-changed event: ${String(next)}`);
      if (next === "en" || next === "zh") applyTranslations(next);
    });
  } catch (e) {
    console.log(`[overlay-i18n] listen failed: ${String(e)}`);
  }
}

void main();
