/**
 * Sidebar TreeView — shows all deployed projects with status,
 * URLs, and quick actions. The main UI surface of the extension.
 *
 * Tree structure:
 *   📦 my-app  ● live
 *     ├─ 🌐 https://my-app.buildandship.it
 *     ├─ 🖥️ http://localhost:4000
 *     ├─ ⚙️ express · 0.5% CPU · 32MB
 *     └─ 📋 Last deploy: 2m ago (● live)
 */

import * as vscode from "vscode";
import { listProjects, statusAll, statusDetail, type ListProject, type StatusProject, type StatusDetail } from "./cli.js";

// ── Tree Item Types ─────────────────────────────────────────────────

type TreeItem = ProjectItem | InfoItem;

class ProjectItem extends vscode.TreeItem {
  constructor(
    public readonly project: ListProject,
    public readonly statusInfo?: StatusProject
  ) {
    super(project.name, vscode.TreeItemCollapsibleState.Expanded);

    // Status icon + description
    const statusIcon = getStatusIcon(project.status);
    this.description = `${statusIcon} ${project.status}`;

    // Icon
    this.iconPath = new vscode.ThemeIcon(
      project.status === "live" ? "circle-filled" : "circle-outline",
      project.status === "live"
        ? new vscode.ThemeColor("testing.iconPassed")
        : project.status === "failed"
          ? new vscode.ThemeColor("testing.iconFailed")
          : new vscode.ThemeColor("testing.iconSkipped")
    );

    // Context value for menu conditions
    const contexts = ["project"];
    if (project.status === "live") { contexts.push("live"); }
    if (project.public_url) { contexts.push("hasUrl"); }
    this.contextValue = contexts.join(",");

    // Tooltip
    const lines = [`${project.name} — ${project.status}`];
    if (project.public_url) { lines.push(`URL: ${project.public_url}`); }
    if (project.tunnel_active) { lines.push("Tunnel: connected"); }
    if (project.auto_deploy) {
      lines.push(`Auto-deploy: ${project.auto_deploy.repo} (${project.auto_deploy.branch})`);
    }
    this.tooltip = new vscode.MarkdownString(lines.join("\n\n"));
  }
}

class InfoItem extends vscode.TreeItem {
  constructor(
    label: string,
    description: string,
    icon: string,
    url?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(icon);
    this.contextValue = url ? "hasUrl" : "info";

    if (url) {
      this.command = {
        command: "vscode.open",
        title: "Open URL",
        arguments: [vscode.Uri.parse(url)],
      };
    }
  }
}

// ── Provider ────────────────────────────────────────────────────────

export class ProjectTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChange = new vscode.EventEmitter<TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private projects: ListProject[] = [];
  private statusMap: Map<string, StatusProject> = new Map();
  private detailCache: Map<string, StatusDetail> = new Map();
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.startAutoRefresh();
  }

  refresh(): void {
    this._onDidChange.fire(undefined);
  }

  /** Load fresh data from CLI and refresh tree */
  async reload(): Promise<void> {
    try {
      // Fetch list and status in parallel
      const [list, status] = await Promise.all([
        listProjects(),
        statusAll(),
      ]);

      this.projects = list;
      this.statusMap.clear();
      this.detailCache.clear();

      for (const p of status.projects) {
        this.statusMap.set(p.name, p);
      }

      this.refresh();
    } catch (err: any) {
      // Silently fail on refresh — don't spam the user
      console.warn("[Build & Ship] Refresh failed:", err.message);
    }
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    // Root level — return project items
    if (!element) {
      if (this.projects.length === 0) {
        await this.reload();
      }
      return this.projects.map((p) => {
        const status = this.statusMap.get(p.name);
        return new ProjectItem(p, status);
      });
    }

    // Project children — return info items
    if (element instanceof ProjectItem) {
      return this.getProjectChildren(element);
    }

    return [];
  }

  private async getProjectChildren(item: ProjectItem): Promise<InfoItem[]> {
    const children: InfoItem[] = [];
    const p = item.project;
    const s = item.statusInfo;

    // Public URL
    if (p.public_url) {
      children.push(new InfoItem(
        "Public URL",
        p.public_url.replace("https://", ""),
        "globe",
        p.public_url
      ));
    }

    // Local URL
    if (s?.local_url && s.local_url !== "—") {
      children.push(new InfoItem(
        "Local",
        s.local_url.replace("http://", ""),
        "device-desktop",
        s.local_url
      ));
    }

    // Resources
    if (s?.framework || s?.cpu || s?.memory) {
      const parts: string[] = [];
      if (s.framework) { parts.push(s.framework); }
      if (s.cpu) { parts.push(`${s.cpu} CPU`); }
      if (s.memory) { parts.push(s.memory); }
      children.push(new InfoItem("Info", parts.join(" · "), "info"));
    }

    // Uptime
    if (s?.uptime) {
      children.push(new InfoItem("Uptime", s.uptime, "clock"));
    }

    // Tunnel
    if (p.tunnel_active) {
      children.push(new InfoItem("Tunnel", "connected", "cloud"));
    }

    // Auto-deploy
    if (p.auto_deploy) {
      children.push(new InfoItem(
        "Auto-deploy",
        `${p.auto_deploy.repo} (${p.auto_deploy.branch})`,
        "git-branch"
      ));
    }

    return children;
  }

  private startAutoRefresh(): void {
    const interval = vscode.workspace.getConfiguration("buildandship")
      .get<number>("refreshInterval", 30);

    if (interval > 0) {
      this.refreshTimer = setInterval(() => {
        this.reload();
      }, interval * 1000);
    }
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this._onDidChange.dispose();
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function getStatusIcon(status: string): string {
  switch (status) {
    case "live": return "●";
    case "building": return "◐";
    case "failed": return "✗";
    case "stopped": return "○";
    default: return "?";
  }
}
