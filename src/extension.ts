/**
 * Build & Ship — VS Code / Cursor / Windsurf Extension
 *
 * Deploy from your editor. One click. Zero DevOps. Your hardware.
 *
 * The UI is ONE webview that adapts to 3 states:
 *   1. No CLI installed → Install it for the user
 *   2. CLI installed, not logged in → GitHub sign-in
 *   3. Logged in → Projects list + Deploy button
 */

import * as vscode from "vscode";
import { checkAuth, login, logout, onAuthChange } from "./auth.js";
import { deploy, init, link, viewLogs, stop, restart, destroy, onDeploySuccess } from "./deploy.js";
import { createStatusBar, updateStatusBar, disposeStatusBar } from "./statusbar.js";
import { WelcomeViewProvider } from "./welcome.js";
import { showPanel } from "./panel.js";

let welcomeProvider: WelcomeViewProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log("[Build & Ship] Extension activating...");

  // ── Main Webview (handles ALL states) ───────────────────────────
  welcomeProvider = new WelcomeViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WelcomeViewProvider.viewType, welcomeProvider)
  );

  // ── Deploy success → confetti celebration! ─────────────────────
  onDeploySuccess((projectName, publicUrl) => {
    welcomeProvider.celebrate(projectName, publicUrl);
    welcomeProvider.refresh();
    updateStatusBar();
  });

  // ── Status Bar ──────────────────────────────────────────────────
  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  // ── Register Commands ───────────────────────────────────────────

  // Auth
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.login", async () => {
      await login();
      welcomeProvider.refresh();
      updateStatusBar();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.logout", async () => {
      await logout();
      welcomeProvider.refresh();
    })
  );

  // Deploy
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.deploy", async () => {
      await deploy();
      // Refresh after deploy terminal closes
      setTimeout(() => {
        welcomeProvider.refresh();
        updateStatusBar();
      }, 3000);
    })
  );

  // Init
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.init", async () => {
      await init();
    })
  );

  // Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.refresh", async () => {
      await welcomeProvider.refresh();
      await updateStatusBar();
    })
  );

  // Open URL
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.openUrl", (item: any) => {
      const url = typeof item === "string" ? item : item?.project?.public_url;
      if (url) {
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
    })
  );

  // View Logs
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.viewLogs", (itemOrName: any) => {
      const name = typeof itemOrName === "string" ? itemOrName : itemOrName?.project?.name;
      if (name) { viewLogs(name); }
    })
  );

  // Stop
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.stop", async (item: any) => {
      const name = typeof item === "string" ? item : item?.project?.name;
      if (name) {
        await stop(name);
        setTimeout(() => welcomeProvider.refresh(), 3000);
      }
    })
  );

  // Restart
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.restart", async (item: any) => {
      const name = typeof item === "string" ? item : item?.project?.name;
      if (name) {
        await restart(name);
        setTimeout(() => welcomeProvider.refresh(), 5000);
      }
    })
  );

  // Destroy
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.destroy", async (item: any) => {
      const name = typeof item === "string" ? item : item?.project?.name;
      if (name) {
        await destroy(name);
        setTimeout(() => welcomeProvider.refresh(), 3000);
      }
    })
  );

  // Link
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.link", async (item: any) => {
      const name = typeof item === "string" ? item : item?.project?.name;
      await link(name);
    })
  );

  // Install CLI
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.installCli", () => {
      const terminal = vscode.window.createTerminal({
        name: "Build & Ship: Install",
        iconPath: new vscode.ThemeIcon("cloud-download"),
      });
      terminal.show();
      terminal.sendText("curl -fsSL https://buildandship.it/install.sh | sh");

      // Watch for terminal close, then refresh
      const disposable = vscode.window.onDidCloseTerminal((t) => {
        if (t === terminal) {
          disposable.dispose();
          setTimeout(() => welcomeProvider.refresh(), 1000);
        }
      });
    })
  );

  // Dashboard Panel
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.showPanel", () => {
      showPanel(context.extensionUri);
    })
  );

  // ── Auth state listener ─────────────────────────────────────────
  onAuthChange(() => {
    welcomeProvider.refresh();
    updateStatusBar();
  });

  // ── Initial check ──────────────────────────────────────────────
  await checkAuth();

  console.log("[Build & Ship] Extension activated ✓");
}

export function deactivate(): void {
  disposeStatusBar();
  console.log("[Build & Ship] Extension deactivated");
}
