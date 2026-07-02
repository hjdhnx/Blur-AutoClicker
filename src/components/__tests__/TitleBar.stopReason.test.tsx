import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { initI18n } from "../../i18n";
import i18n from "../../i18n";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    close: vi.fn(),
    setAlwaysOnTop: vi.fn(),
  }),
}));

const TitleBar = (await import("../TitleBar")).default;

function renderTitleBar(overrides: Record<string, unknown> = {}) {
  return render(
    <TitleBar
      tab="simple"
      setTab={() => {}}
      running={false}
      paused={false}
      stopReason="click_limit_reached"
      stopReasonValue={1000}
      stopKey={1}
      isAlwaysOnTop={false}
      onToggleAlwaysOnTop={() => Promise.resolve()}
      onRequestClose={() => Promise.resolve()}
      warning={null}
      {...overrides}
    />,
  );
}

describe("TitleBar stop reason translation", () => {
  beforeEach(async () => {
    await initI18n("en");
  });

  it("renders the translated stop reason in English", async () => {
    renderTitleBar();
    expect(
      await screen.findByText("Click limit reached (1000)"),
    ).toBeInTheDocument();
    cleanup();
  });

  it("renders the translated stop reason in Chinese after language switch", async () => {
    renderTitleBar();
    await screen.findByText("Click limit reached (1000)");
    await i18n.changeLanguage("zh");
    // changing language updates the store; fire a re-render by toggling stopKey
    cleanup();
    render(
      <TitleBar
        tab="simple"
        setTab={() => {}}
        running={false}
        paused={false}
        stopReason="time_limit_reached"
        stopReasonValue={5}
        stopKey={2}
        isAlwaysOnTop={false}
        onToggleAlwaysOnTop={() => Promise.resolve()}
        onRequestClose={() => Promise.resolve()}
        warning={null}
      />,
    );
    expect(
      await screen.findByText("已达到时间上限 (5秒)"),
    ).toBeInTheDocument();
  });
});
