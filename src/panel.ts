/**
 * Dashboard Panel — a rich webview showing detailed project status,
 * deploy history, resource metrics, QR codes, and live URLs.
 *
 * Design: Modern, classy, professional typography.
 * Think Linear/Vercel dashboard — not a toy.
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
    "Build & Ship",
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
      case "stop":
        vscode.commands.executeCommand("buildandship.stop", message.project);
        break;
      case "restart":
        vscode.commands.executeCommand("buildandship.restart", message.project);
        break;
      case "destroy":
        vscode.commands.executeCommand("buildandship.destroy", message.project);
        setTimeout(() => refreshPanel(currentPanel!), 3000);
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getHtml(projects: ListProject[], details: StatusDetail[]): string {
  const liveCount = projects.filter((p) => p.status === "live").length;
  const totalCount = projects.length;

  const projectCards = details.map((d) => {
    const project = projects.find((p) => p.name === d.name);
    const isLive = d.status === "live";
    const isFailed = d.status === "failed";
    const statusClass = isLive ? "live" : isFailed ? "failed" : "stopped";
    const url = d.public_url?.replace("https://", "") || "";
    const fullUrl = d.public_url || "";

    // Deploy history rows
    const deploysHtml = (d.deploys || []).slice(0, 5).map((dep) => {
      const depClass = dep.status === "live" ? "dep-live" : dep.status === "failed" ? "dep-failed" : "dep-building";
      const duration = dep.duration_ms ? `${(dep.duration_ms / 1000).toFixed(1)}s` : "\u2014";
      const sha = dep.commit_sha ? dep.commit_sha.slice(0, 7) : "\u2014";
      const time = formatRelativeTime(dep.created_at);
      return `<tr class="${depClass}">
        <td><span class="dep-dot"></span>${escapeHtml(dep.status)}</td>
        <td><code>${sha}</code></td>
        <td>${duration}</td>
        <td>${escapeHtml(time)}</td>
      </tr>`;
    }).join("");

    // Resources pill
    const resourcesHtml = d.resources ? `
      <div class="metrics">
        <div class="metric">
          <span class="metric-label">CPU</span>
          <span class="metric-value">${escapeHtml(d.resources.cpu)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Memory</span>
          <span class="metric-value">${escapeHtml(d.resources.memory)}</span>
        </div>
        ${d.resources.net ? `<div class="metric">
          <span class="metric-label">Network</span>
          <span class="metric-value">${escapeHtml(d.resources.net)}</span>
        </div>` : ""}
      </div>` : "";

    return `
    <div class="project-card status-${statusClass}">
      <div class="card-top">
        <div class="card-identity">
          <div class="status-indicator ${statusClass}"></div>
          <div class="card-titles">
            <h2 class="card-name">${escapeHtml(d.name)}</h2>
            <div class="card-meta">
              ${d.framework ? `<span class="meta-chip">${escapeHtml(d.framework)}</span>` : ""}
              <span class="meta-chip meta-status-${statusClass}">${d.status}</span>
              ${isLive && d.uptime ? `<span class="meta-text">Up ${escapeHtml(d.uptime)}</span>` : ""}
            </div>
          </div>
        </div>
        <div class="card-actions">
          <button class="action-btn" onclick="post('viewLogs', { project: '${escapeHtml(d.name)}' })" title="View Logs">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z"/></svg>
          </button>
          <button class="action-btn" onclick="post('restart', { project: '${escapeHtml(d.name)}' })" title="Restart">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg>
          </button>
          <button class="action-btn" onclick="post('stop', { project: '${escapeHtml(d.name)}' })" title="Stop">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/></svg>
          </button>
        </div>
      </div>

      ${isLive && url ? `
      <div class="url-showcase">
        <div class="url-main">
          <a class="live-url" href="#" onclick="post('openUrl', { url: '${escapeHtml(fullUrl)}' })">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" opacity="0.5"><path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/><path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243L6.586 4.672z"/></svg>
            ${escapeHtml(url)}
            <svg class="url-external" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity="0.35"><path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>
          </a>
        </div>
        <div class="qr-block">
          <div class="qr-frame">
            <img
              class="qr-img"
              src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&bgcolor=ffffff&color=000000&data=${encodeURIComponent(fullUrl)}"
              alt="QR Code"
              onerror="this.parentElement.parentElement.style.display='none'"
            />
          </div>
          <span class="qr-caption">Share with the world</span>
        </div>
      </div>` : ""}

      ${d.local_url ? `
      <div class="local-url-row">
        <span class="local-label">Local</span>
        <a class="local-link" href="#" onclick="post('openUrl', { url: '${escapeHtml(d.local_url)}' })">${escapeHtml(d.local_url)}</a>
      </div>` : ""}

      ${resourcesHtml}

      ${deploysHtml ? `
      <div class="deploys-section">
        <h3 class="section-heading">Deploy History</h3>
        <table class="deploys-table">
          <thead><tr><th>Status</th><th>Commit</th><th>Duration</th><th>When</th></tr></thead>
          <tbody>${deploysHtml}</tbody>
        </table>
      </div>` : ""}

      ${project?.tunnel_active ? '<div class="public-badge"><span class="public-dot"></span> Public &mdash; The world can see it</div>' : ""}

      <div class="danger-zone-section">
        <details class="danger-details">
          <summary class="danger-summary">Danger Zone</summary>
          <div class="danger-body">
            <p class="danger-text">Permanently destroy <strong>${escapeHtml(d.name)}</strong> and all its data. This action cannot be undone.</p>
            <button class="danger-btn" onclick="post('destroy', { project: '${escapeHtml(d.name)}' })">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1h2.5a1 1 0 0 1 1 1v1z"/></svg>
              Destroy Project
            </button>
          </div>
        </details>
      </div>
    </div>`;
  }).join("");

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', var(--vscode-font-family), system-ui, -apple-system, sans-serif;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* ── Top bar ──────────────────────────────── */

    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 32px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-widget-border);
      backdrop-filter: blur(12px);
    }

    .topbar-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .brand {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.4px;
    }

    .brand-accent {
      color: #f59e0b;
    }

    .stats {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .stat-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      background: rgba(74, 222, 128, 0.1);
      color: #4ade80;
    }

    .stat-pill.stat-total {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .stat-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }

    .topbar-actions {
      display: flex;
      gap: 8px;
    }

    .topbar-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 8px;
      background: transparent;
      color: var(--vscode-foreground);
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .topbar-btn:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
    }

    .topbar-btn-deploy {
      background: #0078d4;
      color: #fff;
      border-color: #0078d4;
      font-weight: 600;
    }

    .topbar-btn-deploy:hover {
      background: #1a8ae8;
      border-color: #1a8ae8;
    }

    /* ── Content ──────────────────────────────── */

    .content {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 32px 48px;
    }

    /* ── Server banner ────────────────────────── */

    .server-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      border-radius: 8px;
      background: rgba(245, 158, 11, 0.06);
      border: 1px solid rgba(245, 158, 11, 0.15);
      margin-bottom: 24px;
      font-size: 12.5px;
      line-height: 1.4;
    }

    .server-banner-icon {
      flex-shrink: 0;
      font-size: 14px;
    }

    .server-banner strong {
      color: #f59e0b;
    }

    /* ── Project cards ────────────────────────── */

    .grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .project-card {
      border: 1px solid var(--vscode-widget-border);
      border-radius: 12px;
      overflow: hidden;
      transition: border-color 0.2s, box-shadow 0.2s;
      animation: slideUp 0.35s ease-out both;
    }

    .project-card:nth-child(1) { animation-delay: 0s; }
    .project-card:nth-child(2) { animation-delay: 0.06s; }
    .project-card:nth-child(3) { animation-delay: 0.12s; }
    .project-card:nth-child(4) { animation-delay: 0.18s; }
    .project-card:nth-child(5) { animation-delay: 0.24s; }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .project-card:hover {
      border-color: var(--vscode-focusBorder);
    }

    .status-live {
      border-left: 3px solid #4ade80;
    }

    .status-failed {
      border-left: 3px solid #f87171;
    }

    .status-stopped {
      border-left: 3px solid #64748b;
    }

    /* ── Card top row ─────────────────────────── */

    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-widget-border);
    }

    .card-identity {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-indicator.live {
      background: #4ade80;
      box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
      animation: glow 2s ease-in-out infinite;
    }

    .status-indicator.failed { background: #f87171; }
    .status-indicator.stopped { background: #64748b; }

    @keyframes glow {
      0%, 100% { box-shadow: 0 0 5px rgba(74, 222, 128, 0.4); }
      50% { box-shadow: 0 0 12px rgba(74, 222, 128, 0.7); }
    }

    .card-titles {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .card-name {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.2px;
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .meta-chip {
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(99, 102, 241, 0.12);
      color: #818cf8;
    }

    .meta-status-live {
      background: rgba(74, 222, 128, 0.12);
      color: #4ade80;
    }

    .meta-status-failed {
      background: rgba(248, 113, 113, 0.12);
      color: #f87171;
    }

    .meta-status-stopped {
      background: rgba(100, 116, 139, 0.12);
      color: #94a3b8;
    }

    .meta-text {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .card-actions {
      display: flex;
      gap: 4px;
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      transition: all 0.15s;
    }

    .action-btn:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-widget-border);
      color: var(--vscode-foreground);
    }

    /* ── URL showcase (the star) ──────────────── */

    .url-showcase {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 16px 20px;
      background: rgba(245, 158, 11, 0.04);
      border-bottom: 1px solid var(--vscode-widget-border);
    }

    .url-main {
      flex: 1;
    }

    .live-url {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 600;
      color: #f59e0b;
      text-decoration: none;
      padding: 8px 14px;
      border-radius: 8px;
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.15);
      transition: all 0.15s;
      word-break: break-all;
    }

    .live-url:hover {
      background: rgba(245, 158, 11, 0.14);
      border-color: rgba(245, 158, 11, 0.3);
      color: #fbbf24;
    }

    .url-external {
      flex-shrink: 0;
      margin-left: 4px;
    }

    .qr-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .qr-frame {
      background: #fff;
      border-radius: 10px;
      padding: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }

    .qr-img {
      display: block;
      width: 96px;
      height: 96px;
      image-rendering: pixelated;
    }

    .qr-caption {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.7;
    }

    /* ── Local URL ────────────────────────────── */

    .local-url-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 20px;
      border-bottom: 1px solid var(--vscode-widget-border);
      font-size: 12.5px;
    }

    .local-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .local-link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 12px;
    }

    .local-link:hover { text-decoration: underline; }

    /* ── Metrics ──────────────────────────────── */

    .metrics {
      display: flex;
      gap: 1px;
      padding: 0 20px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }

    .metric {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 12px 12px 12px 0;
    }

    .metric:not(:last-child) {
      border-right: 1px solid var(--vscode-widget-border);
      padding-right: 12px;
    }

    .metric-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--vscode-descriptionForeground);
    }

    .metric-value {
      font-size: 14px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.2px;
    }

    /* ── Deploy history ───────────────────────── */

    .deploys-section {
      padding: 14px 20px;
    }

    .section-heading {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 10px;
    }

    .deploys-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .deploys-table th {
      text-align: left;
      padding: 6px 10px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      border-bottom: 1px solid var(--vscode-widget-border);
    }

    .deploys-table td {
      padding: 7px 10px;
      border-bottom: 1px solid var(--vscode-widget-border);
      font-variant-numeric: tabular-nums;
    }

    .deploys-table tbody tr:last-child td {
      border-bottom: none;
    }

    .deploys-table code {
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 11px;
      padding: 1px 5px;
      border-radius: 3px;
      background: var(--vscode-textCodeBlock-background);
    }

    .dep-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      margin-right: 6px;
    }

    .dep-live .dep-dot { background: #4ade80; }
    .dep-failed .dep-dot { background: #f87171; }
    .dep-building .dep-dot { background: #fbbf24; }

    /* ── Public badge ─────────────────────────── */

    .public-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: 12px 20px;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 600;
      background: rgba(74, 222, 128, 0.08);
      border: 1px solid rgba(74, 222, 128, 0.15);
      color: #4ade80;
    }

    .public-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #4ade80;
      display: inline-block;
    }

    /* ── Danger zone ─────────────────────────── */

    .danger-zone-section {
      padding: 12px 20px;
      border-top: 1px solid var(--vscode-widget-border);
    }

    .danger-details summary {
      list-style: none;
      cursor: pointer;
    }

    .danger-details summary::-webkit-details-marker { display: none; }

    .danger-summary {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      opacity: 0.45;
      transition: opacity 0.15s;
      padding: 2px 0;
    }

    .danger-summary::before { content: "\\25B8  "; font-size: 9px; }
    .danger-details[open] > .danger-summary::before { content: "\\25BE  "; }

    .danger-summary:hover { opacity: 0.75; }

    .danger-body {
      padding: 12px 0 4px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .danger-text {
      font-size: 12px;
      color: #f87171;
      line-height: 1.5;
      opacity: 0.8;
    }

    .danger-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border: 1px solid rgba(248, 113, 113, 0.3);
      border-radius: 8px;
      background: rgba(248, 113, 113, 0.06);
      color: #f87171;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      width: fit-content;
    }

    .danger-btn:hover {
      background: rgba(248, 113, 113, 0.14);
      border-color: rgba(248, 113, 113, 0.5);
      color: #ef4444;
    }

    /* ── Empty state ──────────────────────────── */

    .empty-state {
      text-align: center;
      padding: 80px 40px;
    }

    .empty-emoji {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state h2 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .empty-state p {
      font-size: 13.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 24px;
      line-height: 1.6;
    }

    .empty-deploy-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 28px;
      background: #0078d4;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
    }

    .empty-deploy-btn:hover {
      background: #1a8ae8;
    }

    /* ── Footer ───────────────────────────────── */

    .footer {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      padding: 24px 0 8px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.6;
    }

    .footer a {
      color: var(--vscode-descriptionForeground);
      text-decoration: none;
    }

    .footer a:hover {
      color: var(--vscode-textLink-foreground);
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-left">
      <span class="brand">Build <span class="brand-accent">&</span> Ship</span>
      <div class="stats">
        <span class="stat-pill"><span class="stat-dot"></span>${liveCount} live</span>
        <span class="stat-pill stat-total">${totalCount} projects</span>
      </div>
    </div>
    <div class="topbar-actions">
      <button class="topbar-btn" onclick="post('refresh')">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg>
        Refresh
      </button>
      <button class="topbar-btn topbar-btn-deploy" onclick="post('deploy')">Deploy</button>
    </div>
  </div>

  <div class="content">
    <div class="server-banner">
      <span class="server-banner-icon">\u26A1</span>
      <span><strong>Your computer is the server.</strong> If you shut down or close the lid, your sites go offline.</span>
    </div>

    ${totalCount === 0 ? `
      <div class="empty-state">
        <div class="empty-emoji">\uD83D\uDE80</div>
        <h2>No projects yet</h2>
        <p>Open a project folder and deploy it.<br>We detect your framework, build a container, and give you a live URL.</p>
        <button class="empty-deploy-btn" onclick="post('deploy')">\uD83D\uDE80 Deploy This Project</button>
      </div>
    ` : `<div class="grid">${projectCards}</div>`}

    <div class="footer">
      <a href="#" onclick="post('openUrl', { url: 'https://buildandship.it' })">buildandship.it</a>
      <span>\u00B7</span>
      <span>Your hardware. Your rules.</span>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function post(command, data) {
      if (typeof data === 'object') {
        vscode.postMessage({ command, ...data });
      } else {
        vscode.postMessage({ command });
      }
    }
  </script>
</body>
</html>`;
}

/** Format a date string as relative time (e.g., "2m ago", "3h ago") */
function formatRelativeTime(dateStr: string): string {
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) { return "just now"; }
    if (diffMin < 60) { return `${diffMin}m ago`; }

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) { return `${diffHr}h ago`; }

    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) { return `${diffDay}d ago`; }

    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function escapeHtmlError(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getErrorHtml(error: string): string {
  return /* html */ `<!DOCTYPE html>
<html>
<head>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', var(--vscode-font-family), system-ui, sans-serif;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 40px;
      text-align: center;
      -webkit-font-smoothing: antialiased;
    }
    .wrap { max-width: 400px; }
    .icon { font-size: 40px; margin-bottom: 16px; }
    h2 { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
    p { font-size: 13px; color: var(--vscode-descriptionForeground); line-height: 1.6; }
    .error-msg {
      margin-top: 12px;
      padding: 8px 14px;
      border-radius: 6px;
      background: rgba(248, 113, 113, 0.08);
      border: 1px solid rgba(248, 113, 113, 0.2);
      color: #f87171;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 11.5px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="icon">\u26A0\uFE0F</div>
    <h2>Could not load dashboard</h2>
    <p>Make sure the <code>bs</code> CLI is installed and you're signed in.</p>
    <div class="error-msg">${escapeHtmlError(error)}</div>
  </div>
</body>
</html>`;
}
