import { chromium, Browser } from "playwright";
import { spawn, ChildProcess } from "child_process";

const OBSIDIAN_PATH = "C:\\Users\\whipl\\AppData\\Local\\Programs\\Obsidian\\Obsidian.exe";
const DEBUG_PORT = 9222;

async function main() {
  console.log("Launching Obsidian with debugging and attempting rapid connection...\n");

  let obsidianProcess: ChildProcess | null = null;
  let browser: Browser | null = null;
  let wsUrl: string | null = null;

  try {
    // Launch Obsidian with debugging flag
    obsidianProcess = spawn(
      OBSIDIAN_PATH,
      [`--remote-debugging-port=${DEBUG_PORT}`, "obsidian://open?vault=Absalom"],
      {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      }
    );

    console.log("Obsidian launched, PID:", obsidianProcess.pid);

    // Capture the websocket URL from stderr as soon as it appears
    const wsUrlPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for debug URL")), 10000);

      obsidianProcess!.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        console.log("[stderr]", output.trim());
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });

      obsidianProcess!.stdout?.on("data", (data: Buffer) => {
        console.log("[stdout]", data.toString().trim());
      });
    });

    wsUrl = await wsUrlPromise;
    console.log("\nGot WebSocket URL:", wsUrl);

    // Try to connect IMMEDIATELY - the launcher process has debugging, but only briefly
    console.log("Attempting rapid connection...");

    browser = await chromium.connectOverCDP(wsUrl, { timeout: 5000 });
    console.log("Connected successfully!");

    const contexts = browser.contexts();
    console.log("Contexts:", contexts.length);

    for (const ctx of contexts) {
      const pages = ctx.pages();
      console.log("Pages:", pages.length);
      for (const page of pages) {
        console.log("  URL:", page.url());
      }
    }

    const page = contexts[0]?.pages()[0];
    if (page) {
      console.log("Taking screenshot...");
      await page.screenshot({ path: "obsidian-debug.png" });
      console.log("Screenshot saved!");

      const hasApp = await page.evaluate(() => typeof (window as any).app !== "undefined");
      console.log("Has window.app:", hasApp);
    }

    console.log("\nSuccess! Keeping connection open for 10 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

  } catch (e: any) {
    console.error("\nError:", e.message);
    console.log("\nThe debug port is only briefly available during Obsidian startup.");
    console.log("The launcher spawns a child process that doesn't inherit debugging.");
  } finally {
    if (browser) {
      await browser.close();
    }
    if (obsidianProcess) {
      console.log("Terminating Obsidian...");
      obsidianProcess.kill();
    }
  }
}

main();
