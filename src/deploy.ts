/**
 * Deploy command — runs `bs deploy` in an integrated terminal
 * with non-invasive status bar progress tracking.
 *
 * UX philosophy: No popups. No modal dialogs. No notification toasts.
 * Progress lives in the status bar where developers expect it.
 * The status bar item auto-clears on success/failure.
 * On success → confetti celebration with public URL + QR code!
 *
 * Deploy watcher: Polls every 1s comparing against a pre-deploy snapshot.
 * Detects success (new live project), failure, and re-deploys instantly —
 * no need for the user to close the terminal.
 */

import * as vscode from "vscode";
import { isCliInstalled, isLoggedIn, statusAll, listProjects } from "./cli.js";

let activeDeployTerminal: vscode.Terminal | undefined;
let deployStatusItem: vscode.StatusBarItem | undefined;
let deployWatcherInterval: ReturnType<typeof setInterval> | undefined;

/** Callback fired when a deploy succeeds with a live URL */
let _onDeploySuccess: ((projectName: string, publicUrl: string) => void) | undefined;

/** Callback fired when a deploy fails (for sidebar refresh) */
let _onDeployFailure: (() => void) | undefined;

/** Register a handler for deploy success events */
export function onDeploySuccess(handler: (projectName: string, publicUrl: string) => void): void {
  _onDeploySuccess = handler;
}

/** Register a handler for deploy failure events */
export function onDeployFailure(handler: () => void): void {
  _onDeployFailure = handler;
}

/** Pre-deploy snapshot of project states for diff detection */
interface ProjectSnapshot {
  status: string;
  url: string;
}

/** Stop the deploy watcher polling */
function stopDeployWatcher(): void {
  if (deployWatcherInterval) {
    clearInterval(deployWatcherInterval);
    deployWatcherInterval = undefined;
  }
}

/**
 * Start watching for deploy completion. Takes a snapshot before deploy starts,
 * then polls every 1 second for state changes. Detects:
 * - New live project (wasn't live before → celebration)
 * - Re-deploy (was live, URL changed → celebration)
 * - Failure (project went to "failed" → refresh only)
 */
async function startDeployWatcher(): Promise<void> {
  // ── Snapshot: capture current state before deploy ──────────────
  const snapshot = new Map<string, ProjectSnapshot>();
  try {
    const [projects, status] = await Promise.all([
      listProjects().catch(() => []),
      statusAll().catch(() => ({ projects: [] })),
    ]);

    // Merge data from both sources for a complete picture
    const statusMap = new Map(status.projects.map((s) => [s.name, s]));
    for (const p of projects) {
      const s = statusMap.get(p.name);
      snapshot.set(p.name, {
        status: p.status || s?.status || "",
        url: p.public_url || s?.url || "",
      });
    }
  } catch {
    // Snapshot failed — we'll still detect new projects (just not re-deploys)
  }

  // ── Poll every 1 second for changes ───────────────────────────
  let tickCount = 0;
  const maxTicks = 600; // 10 minutes at 1s intervals
  let alreadyFired = false;

  stopDeployWatcher(); // Clear any existing watcher

  deployWatcherInterval = setInterval(async () => {
    tickCount++;
    if (tickCount > maxTicks || alreadyFired) {
      stopDeployWatcher();
      return;
    }

    try {
      const [projects, status] = await Promise.all([
        listProjects().catch(() => []),
        statusAll().catch(() => ({ projects: [] })),
      ]);

      const statusMap = new Map(status.projects.map((s) => [s.name, s]));

      for (const p of projects) {
        const s = statusMap.get(p.name);
        const currentStatus = p.status || s?.status || "";
        const currentUrl = p.public_url || s?.url || "";
        const prev = snapshot.get(p.name);

        // ── Detect SUCCESS: project is now live with a URL ──────
        if (currentStatus === "live" && currentUrl) {
          const wasLive = prev?.status === "live";
          const urlChanged = prev?.url !== currentUrl;
          const wasNotLive = !prev || prev.status !== "live";

          if (wasNotLive || urlChanged) {
            // New deploy or re-deploy succeeded!
            alreadyFired = true;
            stopDeployWatcher();
            clearDeployProgress();
            if (_onDeploySuccess) {
              _onDeploySuccess(p.name, currentUrl);
            }
            return;
          }
        }

        // ── Detect FAILURE: project went from building to failed ──
        if (currentStatus === "failed" && prev && prev.status !== "failed") {
          alreadyFired = true;
          stopDeployWatcher();
          clearDeployProgress();
          if (_onDeployFailure) {
            _onDeployFailure();
          }
          return;
        }
      }
    } catch {
      // Silently ignore polling errors — keep trying
    }
  }, 1000);
}

/** Run `bs deploy` in the integrated terminal */
export async function deploy(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    // This is the one case where a message is warranted — no folder open
    vscode.window.showErrorMessage("Build & Ship: Open a project folder first. We can't deploy vibes alone.");
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

  // If there's already a deploy terminal, check if it's still alive
  if (activeDeployTerminal) {
    // Check if the terminal is still in the active terminal list
    const stillAlive = vscode.window.terminals.includes(activeDeployTerminal);
    if (stillAlive) {
      // Dispose the old terminal so we can start a fresh deploy
      activeDeployTerminal.dispose();
    }
    activeDeployTerminal = undefined;
  }

  // ── Snapshot + start watching BEFORE deploy starts ─────────────
  await startDeployWatcher();

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

  // ── Terminal close: cleanup ───────────────────────────────────
  const disposable = vscode.window.onDidCloseTerminal(async (t) => {
    if (t === terminal) {
      activeDeployTerminal = undefined;
      disposable.dispose();
      stopDeployWatcher();
      clearDeployProgress();
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

  deployStatusItem.text = `$(sync~spin) Shipping ${projectName}…`;
  deployStatusItem.tooltip = "Your code is becoming a website — click to watch the magic";
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
    vscode.window.showErrorMessage("Build & Ship: Open a project folder first. We need something to work with!");
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
    `Destroy ${projectName}? This nukes everything. There is no ctrl+z for this.`,
    { modal: true },
    "Destroy"
  );

  if (confirm !== "Destroy") { return; }

  const terminal = vscode.window.createTerminal({
    name: `Build & Ship: Destroy`,
    iconPath: new vscode.ThemeIcon("trash"),
    isTransient: true,
  });

  terminal.sendText(`bs destroy ${projectName} --force`);
  terminal.show();
}
