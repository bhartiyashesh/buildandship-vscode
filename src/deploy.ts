/**
 * Deploy command — runs `bs deploy` in an integrated terminal
 * with progress tracking and notifications.
 */

import * as vscode from "vscode";

let activeDeployTerminal: vscode.Terminal | undefined;

/** Run `bs deploy` in the integrated terminal */
export async function deploy(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    vscode.window.showErrorMessage("Build & Ship: Open a project folder first.");
    return;
  }

  // If there's already a deploy running, ask to cancel
  if (activeDeployTerminal) {
    const action = await vscode.window.showWarningMessage(
      "A deploy is already running. Open it?",
      "Show Terminal",
      "Cancel"
    );
    if (action === "Show Terminal") {
      activeDeployTerminal.show();
    }
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

  // Track terminal lifecycle
  const disposable = vscode.window.onDidCloseTerminal((t) => {
    if (t === terminal) {
      activeDeployTerminal = undefined;
      disposable.dispose();
    }
  });

  // Show progress notification
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Build & Ship",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "Deploying..." });

      // Wait for terminal to close
      await new Promise<void>((resolve) => {
        const d = vscode.window.onDidCloseTerminal((t) => {
          if (t === terminal) {
            d.dispose();
            resolve();
          }
        });
      });

      progress.report({ message: "Deploy finished!", increment: 100 });
    }
  );
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

/** Stop a project */
export async function stop(projectName: string): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    `Stop ${projectName}? This will stop the running container.`,
    { modal: true },
    "Stop"
  );

  if (confirm !== "Stop") { return; }

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

/** Destroy a project */
export async function destroy(projectName: string): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    `⚠️ Destroy ${projectName}? This removes the container, image, subdomain, and all deploy history. This cannot be undone.`,
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
