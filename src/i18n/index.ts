import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import commonEn from "../locales/en/common.json";
import commonZh from "../locales/zh/common.json";
import advancedEn from "../locales/en/advanced.json";
import advancedZh from "../locales/zh/advanced.json";
import zonesEn from "../locales/en/zones.json";
import zonesZh from "../locales/zh/zones.json";
import settingsEn from "../locales/en/settings.json";
import settingsZh from "../locales/zh/settings.json";
import hotkeysEn from "../locales/en/hotkeys.json";
import hotkeysZh from "../locales/zh/hotkeys.json";
import stopReasonEn from "../locales/en/stopReason.json";
import stopReasonZh from "../locales/zh/stopReason.json";
import overlayEn from "../locales/en/overlay.json";
import overlayZh from "../locales/zh/overlay.json";

export type Language = "en" | "zh";

export const LANGUAGES: Language[] = ["en", "zh"];

const NAMESPACES = [
  "common",
  "advanced",
  "zones",
  "settings",
  "hotkeys",
  "stopReason",
  "overlay",
] as const;

const resources = {
  en: {
    common: commonEn,
    advanced: advancedEn,
    zones: zonesEn,
    settings: settingsEn,
    hotkeys: hotkeysEn,
    stopReason: stopReasonEn,
    overlay: overlayEn,
  },
  zh: {
    common: commonZh,
    advanced: advancedZh,
    zones: zonesZh,
    settings: settingsZh,
    hotkeys: hotkeysZh,
    stopReason: stopReasonZh,
    overlay: overlayZh,
  },
};

let initialized = false;

export function resolveInitialLanguage(
  saved?: string | null | undefined,
): Language {
  if (saved === "en" || saved === "zh") return saved;
  const nav = (
    (navigator.languages && navigator.languages[0]) ||
    navigator.language ||
    "en"
  ).toLowerCase();
  return nav.startsWith("zh") ? "zh" : "en";
}

export async function initI18n(language: Language): Promise<void> {
  if (!initialized) {
    i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: "en",
      supportedLngs: LANGUAGES,
      ns: NAMESPACES,
      defaultNS: "common",
      interpolation: { escapeValue: false },
      returnNull: false,
    });
    initialized = true;
  } else {
    await i18n.changeLanguage(language);
  }
}

export default i18n;
