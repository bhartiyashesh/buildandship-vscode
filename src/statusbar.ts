/**
 * Status Bar — shows the current project's status in the bottom bar.
 *
 * Examples:
 *   $(rocket) my-app ● live
 *   $(rocket) my-app ○ stopped
 *   $(rocket) Build & Ship: 2 projects live
 */

import * as vscode from "vscode";
import { listProjects, type ListProject } from "./cli.js";

let statusBarItem: vscode.StatusBarItem | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

export function createStatusBar(): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50
  );

  statusBarItem.command = "buildandship.showPanel";
  statusBarItem.name = "Build & Ship";

  updateStatusBar();
  startAutoRefresh();

  return statusBarItem;
}

export async function updateStatusBar(): Promise<void> {
  if (!statusBarItem) { return; }

  const showStatusBar = vscode.workspace.getConfiguration("buildandship")
    .get<boolean>("showStatusBar", true);

  if (!showStatusBar) {
    statusBarItem.hide();
    return;
  }

  try {
    const projects = await listProjects();

    if (projects.length === 0) {
      statusBarItem.text = "$(rocket) Build & Ship";
      statusBarItem.tooltip = "No projects deployed. Click to deploy.";
      statusBarItem.command = "buildandship.deploy";
      statusBarItem.show();
      return;
    }

    // Find the project matching current workspace
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name;
    const currentProject = projects.find((p) => p.name === workspaceName);

    if (currentProject) {
      // Show current project status
      const icon = currentProject.status === "live" ? "●" : "○";
      statusBarItem.text = `$(rocket) ${currentProject.name} ${icon}`;
      statusBarItem.tooltip = formatTooltip(currentProject);

      statusBarItem.backgroundColor = currentProject.status === "failed"
        ? new vscode.ThemeColor("statusBarItem.errorBackground")
        : undefined;

      // Click opens the live URL if available, otherwise the panel
      if (currentProject.public_url) {
        statusBarItem.command = {
          command: "vscode.open",
          title: "Open Live URL",
          arguments: [vscode.Uri.parse(currentProject.public_url)],
        };
      } else {
        statusBarItem.command = "buildandship.showPanel";
      }
    } else {
      // Show summary for all projects
      const liveCount = projects.filter((p) => p.status === "live").length;
      statusBarItem.text = `$(rocket) B&S: ${liveCount}/${projects.length} live`;
      statusBarItem.tooltip = projects
        .map((p) => `${p.status === "live" ? "●" : "○"} ${p.name}`)
        .join("\n");
      statusBarItem.command = "buildandship.showPanel";
    }

    statusBarItem.show();
  } catch {
    // CLI not available — hide status bar
    statusBarItem.hide();
  }
}

function formatTooltip(p: ListProject): string {
  const lines = [`${p.name} — ${p.status}`];
  if (p.public_url) { lines.push(`🌐 ${p.public_url}`); }
  if (p.tunnel_active) { lines.push("🔗 Tunnel connected"); }
  if (p.auto_deploy) { lines.push(`🔄 ${p.auto_deploy.repo}`); }
  lines.push("", "Click to open");
  return lines.join("\n");
}

function startAutoRefresh(): void {
  const interval = vscode.workspace.getConfiguration("buildandship")
    .get<number>("refreshInterval", 30);

  if (interval > 0) {
    refreshTimer = setInterval(() => {
      updateStatusBar();
    }, interval * 1000);
  }
}

export function disposeStatusBar(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  statusBarItem?.dispose();
}
