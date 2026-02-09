/**
 * Build & Ship — VS Code / Cursor / Windsurf Extension
 *
 * Deploy from your editor. One click. Zero DevOps. Your hardware.
 *
 * This is the main entry point. It registers all commands,
 * views, and providers. The extension activates when:
 *   - A workspace contains bs.yml or Dockerfile
 *   - The user runs any Build & Ship command
 */

import * as vscode from "vscode";
import { checkAuth, login, logout, onAuthChange } from "./auth.js";
import { ProjectTreeProvider } from "./sidebar.js";
import { deploy, init, link, viewLogs, stop, restart, destroy } from "./deploy.js";
import { createStatusBar, updateStatusBar, disposeStatusBar } from "./statusbar.js";
import { WelcomeViewProvider } from "./welcome.js";
import { showPanel } from "./panel.js";

let treeProvider: ProjectTreeProvider;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log("[Build & Ship] Extension activating...");

  // ── Sidebar TreeView ────────────────────────────────────────────
  treeProvider = new ProjectTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("buildandship.projects", treeProvider)
  );

  // ── Welcome View (webview for unauthenticated state) ────────────
  const welcomeProvider = new WelcomeViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(WelcomeViewProvider.viewType, welcomeProvider)
  );

  // ── Status Bar ──────────────────────────────────────────────────
  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  // ── Register Commands ───────────────────────────────────────────

  // Auth
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.login", async () => {
      await login();
      treeProvider.reload();
      updateStatusBar();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.logout", async () => {
      await logout();
    })
  );

  // Deploy
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.deploy", async () => {
      await deploy();
      // Refresh after deploy terminal closes
      setTimeout(() => {
        treeProvider.reload();
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
      await treeProvider.reload();
      await updateStatusBar();
      vscode.window.showInformationMessage("Build & Ship: Refreshed!");
    })
  );

  // Open URL
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.openUrl", (item: any) => {
      // Can be called from tree item or with a URL string
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
      if (name) {
        viewLogs(name);
      }
    })
  );

  // Stop
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.stop", async (item: any) => {
      const name = typeof item === "string" ? item : item?.project?.name;
      if (name) {
        await stop(name);
        setTimeout(() => treeProvider.reload(), 3000);
      }
    })
  );

  // Restart
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.restart", async (item: any) => {
      const name = typeof item === "string" ? item : item?.project?.name;
      if (name) {
        await restart(name);
        setTimeout(() => treeProvider.reload(), 5000);
      }
    })
  );

  // Destroy
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.destroy", async (item: any) => {
      const name = typeof item === "string" ? item : item?.project?.name;
      if (name) {
        await destroy(name);
        setTimeout(() => treeProvider.reload(), 3000);
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

  // Dashboard Panel
  context.subscriptions.push(
    vscode.commands.registerCommand("buildandship.showPanel", () => {
      showPanel(context.extensionUri);
    })
  );

  // ── Auth state listener ─────────────────────────────────────────
  onAuthChange((loggedIn) => {
    if (loggedIn) {
      treeProvider.reload();
      updateStatusBar();
    }
  });

  // ── Initial auth check ──────────────────────────────────────────
  await checkAuth();

  // If logged in, load data immediately
  const loggedIn = await checkAuth();
  if (loggedIn) {
    treeProvider.reload();
  }

  console.log("[Build & Ship] Extension activated ✓");
}

export function deactivate(): void {
  treeProvider?.dispose();
  disposeStatusBar();
  console.log("[Build & Ship] Extension deactivated");
}
