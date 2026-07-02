import "@testing-library/jest-dom/vitest";
import { beforeAll } from "vitest";
import { initI18n } from "../i18n";

vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  log: vi.fn(),
}));

beforeAll(async () => {
  await initI18n("en");
});
