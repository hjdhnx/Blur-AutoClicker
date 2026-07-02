import { afterEach, describe, expect, it } from "vitest";
import i18n, { initI18n, resolveInitialLanguage } from "../index";

describe("resolveInitialLanguage", () => {
  it("returns an explicitly saved language", () => {
    expect(resolveInitialLanguage("en")).toBe("en");
    expect(resolveInitialLanguage("zh")).toBe("zh");
  });

  it("falls back to navigator when saved value is invalid", () => {
    expect(resolveInitialLanguage(undefined)).toMatch(/^(en|zh)$/);
    expect(resolveInitialLanguage("fr")).toMatch(/^(en|zh)$/);
  });
});

describe("i18n stopReason namespace", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("translates a known stop reason code to English", () => {
    expect(i18n.t("stopReason:stopped_from_hotkey")).toBe(
      "Stopped from hotkey",
    );
  });

  it("translates a known stop reason code to Chinese after switching language", async () => {
    await initI18n("zh");
    expect(i18n.t("stopReason:stopped_from_hotkey")).toBe("已通过热键停止");
  });

  it("interpolates the value for click_limit_reached", async () => {
    await initI18n("zh");
    expect(i18n.t("stopReason:click_limit_reached", { value: 10 })).toBe(
      "已达到点击上限 (10)",
    );
  });
});
