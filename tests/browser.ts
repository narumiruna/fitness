import { existsSync } from "node:fs";
import { release } from "node:os";

// Keep the system Chrome channel on macOS and Windows. On Linux, the
// chromium channel uses the bundled full browser, not the headless shell.
export const browserChannel =
  process.platform !== "linux" || existsSync("/opt/google/chrome/chrome")
    ? "chrome"
    : "chromium";

export function browserLaunchArgs(headless: boolean): string[] {
  return !headless &&
    process.platform === "linux" &&
    /microsoft/i.test(release()) &&
    process.env.WAYLAND_DISPLAY
    ? ["--ozone-platform=wayland"]
    : [];
}
