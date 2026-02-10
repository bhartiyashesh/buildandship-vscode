/**
 * Authentication — uses `bs login` / `bs logout` / `bs whoami`
 * through the CLI. The CLI handles the full GitHub OAuth flow,
 * we just need to run it in a terminal and detect when it's done.
 */

import * as vscode from "vscode";
import { isLoggedIn, isCliInstalled } from "./cli.js";

let _loggedIn = false;
const _onAuthChange = new vscode.EventEmitter<boolean>();

/** Fires when auth state changes */
export const onAuthChange = _onAuthChange.event;

/** Current auth state */
export function loggedIn(): boolean {
  return _loggedIn;
}

/** Check auth state and update context */
export async function checkAuth(): Promise<boolean> {
  const wasLoggedIn = _loggedIn;

  // First check if CLI exists
  const installed = await isCliInstalled();
  if (!installed) {
    _loggedIn = false;
    await vscode.commands.executeCommand("setContext", "buildandship.cliInstalled", false);
    await vscode.commands.executeCommand("setContext", "buildandship.loggedIn", false);
    if (wasLoggedIn !== _loggedIn) {
      _onAuthChange.fire(_loggedIn);
    }
    return false;
  }

  await vscode.commands.executeCommand("setContext", "buildandship.cliInstalled", true);

  _loggedIn = await isLoggedIn();
  await vscode.commands.executeCommand("setContext", "buildandship.loggedIn", _loggedIn);

  if (wasLoggedIn !== _loggedIn) {
    _onAuthChange.fire(_loggedIn);
  }

  return _loggedIn;
}

/** Run `bs login` in terminal and detect when auth succeeds */
export async function login(): Promise<void> {
  const terminal = vscode.window.createTerminal({
    name: "Build & Ship: Login",
    iconPath: new vscode.ThemeIcon("sign-in"),
  });

  terminal.show();
  terminal.sendText("bs login");

  // Poll for auth success instead of waiting for terminal close.
  // bs login completes in the background (OAuth callback) and the terminal
  // stays open — we detect success by polling `bs whoami --json`.
  let resolved = false;

  await new Promise<void>((resolve) => {
    // Poll every 2s for up to 5 minutes
    const poll = setInterval(async () => {
      if (resolved) { return; }
      const authed = await isLoggedIn();
      if (authed) {
        resolved = true;
        clearInterval(poll);
        resolve();
      }
    }, 2000);

    // Also resolve if terminal is closed (user gave up)
    const disposable = vscode.window.onDidCloseTerminal((t) => {
      if (t === terminal && !resolved) {
        resolved = true;
        clearInterval(poll);
        disposable.dispose();
        resolve();
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(poll);
        resolve();
      }
    }, 5 * 60 * 1000);
  });

  // Re-check auth
  await checkAuth();

  if (_loggedIn) {
    vscode.window.showInformationMessage("Build & Ship: Signed in successfully! 🚀");
  }
}

/** Run `bs logout` */
export async function logout(): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    "Sign out of Build & Ship?",
    { modal: true },
    "Sign Out"
  );

  if (confirm !== "Sign Out") {
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: "Build & Ship: Logout",
    iconPath: new vscode.ThemeIcon("sign-out"),
    isTransient: true,
  });

  terminal.sendText("bs logout");

  // Wait briefly then check
  await new Promise((r) => setTimeout(r, 2000));
  terminal.dispose();
  await checkAuth();

  vscode.window.showInformationMessage("Build & Ship: Signed out.");
}
