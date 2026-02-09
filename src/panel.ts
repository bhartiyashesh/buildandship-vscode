/**
 * Dashboard Panel — a rich webview showing detailed project status,
 * deploy history, and live resource metrics. Opens from the command
 * palette or status bar click.
 */

import * as vscode from "vscode";
import { statusDetail, listProjects, type StatusDetail, type ListProject } from "./cli.js";

let currentPanel: vscode.WebviewPanel | undefined;

export async function showPanel(extensionUri: vscode.Uri): Promise<void> {
  // Reuse existing panel if open
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    await refreshPanel(currentPanel);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    "buildandship.dashboard",
    "Build & Ship Dashboard",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  currentPanel.iconPath = new vscode.ThemeIcon("rocket");

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });

  // Handle messages from webview
  currentPanel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case "deploy":
        vscode.commands.executeCommand("buildandship.deploy");
        break;
      case "openUrl":
        vscode.env.openExternal(vscode.Uri.parse(message.url));
        break;
      case "viewLogs":
        vscode.commands.executeCommand("buildandship.viewLogs", message.project);
        break;
      case "refresh":
        await refreshPanel(currentPanel!);
        break;
    }
  });

  await refreshPanel(currentPanel);
}

async function refreshPanel(panel: vscode.WebviewPanel): Promise<void> {
  try {
    const projects = await listProjects();

    // Get details for each project (in parallel)
    const details = await Promise.all(
      projects.map((p) =>
        statusDetail(p.name).catch(() => null)
      )
    );

    panel.webview.html = getHtml(projects, details.filter(Boolean) as StatusDetail[]);
  } catch (err: any) {
    panel.webview.html = getErrorHtml(err.message);
  }
}

function getHtml(projects: ListProject[], details: StatusDetail[]): string {
  const projectCards = details.map((d) => {
    const project = projects.find((p) => p.name === d.name);
    const statusColor = d.status === "live" ? "#4ade80"
      : d.status === "failed" ? "#f87171"
        : "#94a3b8";

    const deploysHtml = (d.deploys || []).slice(0, 5).map((dep) => {
      const icon = dep.status === "live" ? "●" : dep.status === "failed" ? "✗" : "◐";
      const color = dep.status === "live" ? "#4ade80" : dep.status === "failed" ? "#f87171" : "#fbbf24";
      const duration = dep.duration_ms ? `${(dep.duration_ms / 1000).toFixed(1)}s` : "—";
      const sha = dep.commit_sha ? dep.commit_sha.slice(0, 7) : "—";
      const time = new Date(dep.created_at).toLocaleString();
      return `<tr>
        <td><span style="color:${color}">${icon}</span> ${dep.status}</td>
        <td><code>${sha}</code></td>
        <td>${duration}</td>
        <td>${time}</td>
      </tr>`;
    }).join("");

    return `
    <div class="card">
      <div class="card-header">
        <div class="project-name">
          <span class="dot" style="background:${statusColor}"></span>
          ${d.name}
        </div>
        <div class="project-meta">${d.framework || ""} ${d.status === "live" ? `· ${d.uptime || ""}` : ""}</div>
      </div>

      <div class="card-body">
        ${d.public_url ? `<div class="url-row">
          <span class="label">🌐</span>
          <a href="#" onclick="post('openUrl', { url: '${d.public_url}' })">${d.public_url}</a>
        </div>` : ""}

        ${d.local_url ? `<div class="url-row">
          <span class="label">🖥️</span>
          <a href="#" onclick="post('openUrl', { url: '${d.local_url}' })">${d.local_url}</a>
        </div>` : ""}

        ${d.resources ? `<div class="resources">
          <span>CPU: ${d.resources.cpu}</span>
          <span>Mem: ${d.resources.memory}</span>
          ${d.resources.net ? `<span>Net: ${d.resources.net}</span>` : ""}
        </div>` : ""}

        ${deploysHtml ? `
        <div class="deploys-section">
          <div class="section-title">Deploy History</div>
          <table class="deploys-table">
            <thead><tr><th>Status</th><th>Commit</th><th>Duration</th><th>When</th></tr></thead>
            <tbody>${deploysHtml}</tbody>
          </table>
        </div>` : ""}

        <div class="card-actions">
          <button onclick="post('viewLogs', { project: '${d.name}' })">📋 Logs</button>
          <button onclick="post('deploy')">🚀 Deploy</button>
        </div>
      </div>
    </div>`;
  }).join("");

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 24px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }

    .header h1 {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }

    .header h1 span { color: var(--vscode-textLink-foreground); }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .header-btn {
      padding: 6px 12px;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      background: transparent;
      color: var(--vscode-foreground);
      font-size: 12px;
      cursor: pointer;
    }

    .header-btn:hover { background: var(--vscode-list-hoverBackground); }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
      gap: 16px;
    }

    .card {
      border: 1px solid var(--vscode-widget-border);
      border-radius: 10px;
      overflow: hidden;
    }

    .card-header {
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-widget-border);
    }

    .project-name {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 700;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .project-meta {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .card-body { padding: 14px 16px; }

    .url-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 13px;
    }

    .url-row a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }

    .url-row a:hover { text-decoration: underline; }

    .resources {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin: 10px 0;
      padding: 8px 10px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 6px;
    }

    .deploys-section { margin-top: 12px; }

    .section-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }

    .deploys-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .deploys-table th {
      text-align: left;
      padding: 4px 8px;
      color: var(--vscode-descriptionForeground);
      font-weight: 600;
      border-bottom: 1px solid var(--vscode-widget-border);
    }

    .deploys-table td {
      padding: 5px 8px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }

    .deploys-table code {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
    }

    .card-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    .card-actions button {
      padding: 5px 12px;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      background: transparent;
      color: var(--vscode-foreground);
      font-size: 12px;
      cursor: pointer;
    }

    .card-actions button:hover { background: var(--vscode-list-hoverBackground); }

    .empty {
      text-align: center;
      padding: 60px 20px;
      color: var(--vscode-descriptionForeground);
    }

    .empty h2 { font-size: 16px; margin-bottom: 8px; color: var(--vscode-foreground); }

    .empty p { font-size: 13px; margin-bottom: 16px; }

    .empty button {
      padding: 10px 20px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Build <span>&</span> Ship</h1>
    <div class="header-actions">
      <button class="header-btn" onclick="post('refresh')">↻ Refresh</button>
      <button class="header-btn" onclick="post('deploy')">🚀 Deploy</button>
    </div>
  </div>

  ${projects.length === 0 ? `
    <div class="empty">
      <h2>No projects yet</h2>
      <p>Deploy your first project to see it here.</p>
      <button onclick="post('deploy')">🚀 Deploy This Project</button>
    </div>
  ` : `<div class="grid">${projectCards}</div>`}

  <script>
    const vscode = acquireVsCodeApi();
    function post(command, data) {
      vscode.postMessage({ command, ...data });
    }
  </script>
</body>
</html>`;
}

function getErrorHtml(error: string): string {
  return /* html */ `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      padding: 40px;
      text-align: center;
    }
    .error { color: var(--vscode-errorForeground); margin-bottom: 16px; }
    code {
      font-family: var(--vscode-editor-font-family);
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <h2>Could not load dashboard</h2>
  <p class="error">${error}</p>
  <p>Make sure the <code>bs</code> CLI is installed and you're logged in.</p>
</body>
</html>`;
}
