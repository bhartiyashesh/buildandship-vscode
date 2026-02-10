/**
 * Deploy command — runs `bs deploy` in an integrated terminal
 * with non-invasive status bar progress tracking.
 *
 * UX philosophy: No popups. No modal dialogs. No notification toasts.
 * Progress lives in the status bar where developers expect it.
 * The status bar item auto-clears on success/failure.
 * On success → confetti celebration with public URL + QR code!
 */

import * as vscode from "vscode";
import { isCliInstalled, isLoggedIn, statusAll } from "./cli.js";

let activeDeployTerminal: vscode.Terminal | undefined;
let deployStatusItem: vscode.StatusBarItem | undefined;

/** Callback fired when a deploy succeeds with a live URL */
let _onDeploySuccess: ((projectName: string, publicUrl: string) => void) | undefined;

/** Register a handler for deploy success events */
export function onDeploySuccess(handler: (projectName: string, publicUrl: string) => void): void {
  _onDeploySuccess = handler;
}

/** Run `bs deploy` in the integrated terminal */
export async function deploy(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    // This is the one case where a message is warranted — no folder open
    vscode.window.showErrorMessage("Build & Ship: Open a project folder first.");
    return;
  }

  // Check CLI is installed
  const cliOk = await isCliInstalled();
  if (!cliOk) {
    await vscode.commands.executeCommand("buildandship.installCli");
    return;
  }

  // Check auth — if not logged in, trigger login first
  const authed = await isLoggedIn();
  if (!authed) {
    await vscode.commands.executeCommand("buildandship.login");
    // Re-check after login flow completes
    const nowAuthed = await isLoggedIn();
    if (!nowAuthed) { return; } // user cancelled login
  }

  // If there's already a deploy running, just focus it — no popup
  if (activeDeployTerminal) {
    activeDeployTerminal.show();
    return;
  }

  // Create terminal for deploy
  const terminal = vscode.window.createTerminal({
    name: "🚀 Build & Ship: Deploy",
    cwd: workspaceFolder.uri,
    iconPath: new vscode.ThemeIcon("rocket"),
  });

  activeDeployTerminal = terminal;
  terminal.show();
  terminal.sendText("bs deploy");

  // ── Status bar progress (non-invasive) ────────────────────────
  showDeployProgress(workspaceFolder.name);

  // Track terminal lifecycle — detect success after terminal closes
  const disposable = vscode.window.onDidCloseTerminal(async (t) => {
    if (t === terminal) {
      activeDeployTerminal = undefined;
      disposable.dispose();
      clearDeployProgress();

      // Poll status to see if a project just went live with a public URL
      try {
        // Brief delay to let CLI finish updating state
        await new Promise((r) => setTimeout(r, 1500));
        const status = await statusAll();
        const liveProject = status.projects.find(
          (p) => p.status === "live" && p.url
        );
        if (liveProject && liveProject.url && _onDeploySuccess) {
          _onDeploySuccess(liveProject.name, liveProject.url);
        }
      } catch {
        // Silently ignore — celebration is nice-to-have, not critical
      }
    }
  });
}

/** Show a discreet animated status bar item during deploy */
function showDeployProgress(projectName: string): void {
  if (!deployStatusItem) {
    deployStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100 // High priority — show prominently but still just a status bar item
    );
  }

  deployStatusItem.text = `$(sync~spin) Deploying ${projectName}…`;
  deployStatusItem.tooltip = "Build & Ship deploy in progress — click to view terminal";
  deployStatusItem.command = "workbench.action.terminal.focus";
  deployStatusItem.backgroundColor = undefined;
  deployStatusItem.show();
}

/** Clear the deploy status bar item (auto-dismiss) */
function clearDeployProgress(): void {
  if (deployStatusItem) {
    deployStatusItem.dispose();
    deployStatusItem = undefined;
  }
}

/** Run `bs init` in terminal */
export async function init(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    vscode.window.showErrorMessage("Build & Ship: Open a project folder first.");
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: "Build & Ship: Init",
    cwd: workspaceFolder.uri,
    iconPath: new vscode.ThemeIcon("add"),
  });

  terminal.show();
  terminal.sendText("bs init");
}

/** Run `bs link` in terminal */
export async function link(projectName?: string): Promise<void> {
  const terminal = vscode.window.createTerminal({
    name: "Build & Ship: Link",
    iconPath: new vscode.ThemeIcon("git-branch"),
  });

  terminal.show();
  terminal.sendText("bs link");
}

/** View logs for a project */
export async function viewLogs(projectName: string): Promise<void> {
  const terminal = vscode.window.createTerminal({
    name: `Build & Ship: Logs (${projectName})`,
    iconPath: new vscode.ThemeIcon("output"),
  });

  terminal.show();
  terminal.sendText(`bs logs ${projectName}`);
}

/** Stop a project — no modal, just do it */
export async function stop(projectName: string): Promise<void> {
  const terminal = vscode.window.createTerminal({
    name: `Build & Ship: Stop`,
    iconPath: new vscode.ThemeIcon("debug-stop"),
    isTransient: true,
  });

  terminal.sendText(`bs stop ${projectName}`);
  terminal.show();
}

/** Restart a project */
export async function restart(projectName: string): Promise<void> {
  const terminal = vscode.window.createTerminal({
    name: `Build & Ship: Restart`,
    iconPath: new vscode.ThemeIcon("debug-restart"),
    isTransient: true,
  });

  terminal.sendText(`bs restart ${projectName}`);
  terminal.show();
}

/** Destroy a project — this one warrants a confirm (destructive + irreversible) */
export async function destroy(projectName: string): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    `Destroy ${projectName}? This removes everything and cannot be undone.`,
    { modal: true },
    "Destroy"
  );

  if (confirm !== "Destroy") { return; }

  const terminal = vscode.window.createTerminal({
    name: `Build & Ship: Destroy`,
    iconPath: new vscode.ThemeIcon("trash"),
    isTransient: true,
  });

  terminal.sendText(`bs destroy ${projectName}`);
  terminal.show();
}
