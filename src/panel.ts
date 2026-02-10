/**
 * Dashboard Panel — full-page webview with rich project details.
 *
 * Design: System Status (macOS) inspired — clean metric tiles,
 * collapsible project cards, inline log viewer, elegant typography.
 *
 * Cards are collapsed by default. Click to expand and see:
 * - System Status-style metric tiles (CPU, Memory, Uptime, Network)
 * - Inline log viewer (no terminal needed)
 * - Deploy history
 * - Management actions
 * - Danger zone
 */

import * as vscode from "vscode";
import { statusDetail, listProjects, getLogs, type StatusDetail, type ListProject } from "./cli.js";

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
      case "viewLogs": {
        // Fetch logs and send back to webview for inline display
        const logs = await getLogs(message.project, 150);
        if (currentPanel) {
          currentPanel.webview.postMessage({
            command: "logsData",
            project: message.project,
            logs,
          });
        }
        break;
      }
      case "stop":
        vscode.commands.executeCommand("buildandship.stop", message.project);
        setTimeout(() => currentPanel && refreshPanel(currentPanel), 3000);
        break;
      case "restart":
        vscode.commands.executeCommand("buildandship.restart", message.project);
        setTimeout(() => currentPanel && refreshPanel(currentPanel), 5000);
        break;
      case "destroy":
        vscode.commands.executeCommand("buildandship.destroy", message.project);
        setTimeout(() => currentPanel && refreshPanel(currentPanel), 3000);
        break;
      case "copyLogs": {
        if (message.text) {
          await vscode.env.clipboard.writeText(message.text);
          vscode.window.showInformationMessage("Logs copied to clipboard.");
        }
        break;
      }
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

  const projectCards = details.map((d, idx) => {
    const project = projects.find((p) => p.name === d.name);
    const isLive = d.status === "live";
    const isFailed = d.status === "failed";
    const isStopped = d.status === "stopped" || d.status === "exited";
    const statusClass = isLive ? "live" : isFailed ? "failed" : "stopped";
    const statusLabel = isLive ? "live" : isFailed ? "failed" : d.status;
    const url = d.public_url?.replace("https://", "") || "";
    const fullUrl = d.public_url || "";
    const eName = escapeHtml(d.name);

    // ── Collapsed header ─────────────────────
    let card = `
    <div class="card ${statusClass}" data-project="${eName}" style="animation-delay: ${idx * 0.05}s">
      <div class="card-header" onclick="toggleCard(this.parentElement)">
        <div class="card-identity">
          <span class="dot ${statusClass}"></span>
          <div class="card-title-area">
            <h2 class="card-name">${eName}</h2>
            <div class="card-chips">
              <span class="chip-status ${statusClass}">${statusLabel}</span>
              ${d.framework ? `<span class="chip-fw">${escapeHtml(d.framework)}</span>` : ""}
              ${isLive && d.uptime ? `<span class="chip-meta">Up ${escapeHtml(d.uptime)}</span>` : ""}
            </div>
          </div>
        </div>
        <svg class="caret" width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708z"/></svg>
      </div>`;

    // URL showcase (always visible for live projects)
    if (isLive && url) {
      card += `
      <div class="url-bar">
        <a class="url-link" href="#" onclick="event.stopPropagation(); post('openUrl', { url: '${escapeHtml(fullUrl)}' })">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity="0.4"><path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/><path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243L6.586 4.672z"/></svg>
          <span class="url-text">${escapeHtml(url)}</span>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" opacity="0.25"><path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>
        </a>
        <span class="public-tag">Public</span>
        <button class="qr-toggle" onclick="event.stopPropagation(); this.closest('.card').querySelector('.qr-panel').classList.toggle('open')" title="QR Code">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0v-3zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5zM.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5z"/></svg>
        </button>
      </div>
      <div class="qr-panel">
        <div class="qr-frame">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&bgcolor=ffffff&color=000000&data=${encodeURIComponent(fullUrl)}" alt="QR" onerror="this.closest('.qr-panel').style.display='none'" />
        </div>
        <span class="qr-label">Point. Scan. Flex.</span>
      </div>`;
    }

    // ── Expanded section ─────────────────────
    card += `<div class="card-body">`;

    // Metric tiles (System Status inspired)
    if (d.resources) {
      card += `<div class="metrics-grid">`;
      card += `
        <div class="metric">
          <div class="metric-icon-wrap"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" opacity="0.45"><path d="M5 0a.5.5 0 0 1 .5.5V2h1V.5a.5.5 0 0 1 1 0V2h1V.5a.5.5 0 0 1 1 0V2h1V.5a.5.5 0 0 1 1 0V2A2.5 2.5 0 0 1 14 4.5h1.5a.5.5 0 0 1 0 1H14v1h1.5a.5.5 0 0 1 0 1H14v1h1.5a.5.5 0 0 1 0 1H14v1h1.5a.5.5 0 0 1 0 1H14a2.5 2.5 0 0 1-2.5 2.5v1.5a.5.5 0 0 1-1 0V14h-1v1.5a.5.5 0 0 1-1 0V14h-1v1.5a.5.5 0 0 1-1 0V14h-1v1.5a.5.5 0 0 1-1 0V14A2.5 2.5 0 0 1 2 11.5H.5a.5.5 0 0 1 0-1H2v-1H.5a.5.5 0 0 1 0-1H2v-1H.5a.5.5 0 0 1 0-1H2v-1H.5a.5.5 0 0 1 0-1H2A2.5 2.5 0 0 1 4.5 2V.5A.5.5 0 0 1 5 0zm-.5 3A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 11.5 3h-7zM5 6.5A1.5 1.5 0 0 1 6.5 5h3A1.5 1.5 0 0 1 11 6.5v3A1.5 1.5 0 0 1 9.5 11h-3A1.5 1.5 0 0 1 5 9.5v-3z"/></svg></div>
          <div class="metric-content">
            <span class="metric-value">${escapeHtml(d.resources.cpu)}</span>
            <span class="metric-label">CPU</span>
          </div>
        </div>
        <div class="metric">
          <div class="metric-icon-wrap"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" opacity="0.45"><path d="M1 3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h4.586a1 1 0 0 0 .707-.293l.353-.353a.5.5 0 0 1 .708 0l.353.353a1 1 0 0 0 .707.293H15a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H1zm2 1a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V5a1 1 0 0 1 1-1zm4 0a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1zm4 0a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1z"/></svg></div>
          <div class="metric-content">
            <span class="metric-value">${escapeHtml(d.resources.memory)}</span>
            <span class="metric-label">Memory</span>
          </div>
        </div>`;
      if (d.resources.net) {
        card += `
        <div class="metric">
          <div class="metric-icon-wrap"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" opacity="0.45"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 0 1 .64-1.539 6.7 6.7 0 0 1 .597-.933A7.025 7.025 0 0 0 2.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 0 0-.656 2.5h2.49z"/></svg></div>
          <div class="metric-content">
            <span class="metric-value">${escapeHtml(d.resources.net)}</span>
            <span class="metric-label">Network</span>
          </div>
        </div>`;
      }
      if (d.uptime) {
        card += `
        <div class="metric">
          <div class="metric-icon-wrap"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" opacity="0.45"><path d="M8 3.5a.5.5 0 0 0-1 0V8a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 7.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg></div>
          <div class="metric-content">
            <span class="metric-value">${escapeHtml(d.uptime)}</span>
            <span class="metric-label">Uptime</span>
          </div>
        </div>`;
      }
      card += `</div>`;
    }

    // Server warning (only for live projects)
    if (isLive) {
      card += `
      <div class="server-note-inline">
        <span class="sn-icon">\u26A1</span>
        <span><strong>Your machine is the server.</strong> Shut it down and your site naps too. VS Code can close though &mdash; we run in the background.</span>
      </div>`;
    }

    // Local URL
    if (d.local_url) {
      card += `
      <div class="local-row">
        <span class="local-badge">Local</span>
        <a class="local-link" href="#" onclick="event.stopPropagation(); post('openUrl', { url: '${escapeHtml(d.local_url)}' })">${escapeHtml(d.local_url)}</a>
      </div>`;
    }

    // Action buttons
    card += `<div class="actions-row">`;
    card += `
      <button class="action-btn" onclick="event.stopPropagation(); toggleLogs('${eName}')" title="View Logs">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z"/></svg>
        Logs
      </button>
      <button class="action-btn" onclick="event.stopPropagation(); post('restart', { project: '${eName}' })" title="Restart">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg>
        Restart
      </button>`;
    if (isLive) {
      card += `
      <button class="action-btn action-warn" onclick="event.stopPropagation(); post('stop', { project: '${eName}' })" title="Stop">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/></svg>
        Stop
      </button>`;
    }
    card += `</div>`;

    // Inline log viewer
    card += `
      <div class="log-viewer" id="panel-logs-${eName}">
        <div class="log-bar">
          <span class="log-label">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" opacity="0.5"><path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z"/></svg>
            Logs &mdash; ${eName}
          </span>
          <div class="log-actions">
            <button class="log-action-btn" onclick="event.stopPropagation(); copyLogs('${eName}')" title="Copy logs">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>
            </button>
            <button class="log-action-btn" onclick="event.stopPropagation(); document.getElementById('panel-logs-${eName}').classList.remove('open')" title="Close logs">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
            </button>
          </div>
        </div>
        <pre class="log-content"><span class="log-placeholder">Hit "Logs" to see what your app is thinking...</span></pre>
      </div>`;

    // Latest deploy (single metric)
    if (d.deploys && d.deploys.length > 0) {
      const latest = d.deploys[0];
      const duration = latest.duration_ms ? `${(latest.duration_ms / 1000).toFixed(1)}s` : "\u2014";
      card += `
      <div class="deploys-section">
        <h3 class="section-title">Ship Log</h3>
        <span class="ship-metric">${duration}</span>
      </div>`;
    }

    // Public badge
    if (project?.tunnel_active) {
      card += `<div class="tunnel-badge"><span class="tunnel-dot"></span>Public \u2014 The world can see it</div>`;
    }

    // Danger zone
    card += `
      <div class="danger-section">
        <details class="danger-details" onclick="event.stopPropagation()">
          <summary class="danger-summary">Danger Zone</summary>
          <div class="danger-inner">
            <p class="danger-text">Permanently delete <strong>${eName}</strong> and all its data. This cannot be undone.</p>
            <button class="danger-btn" onclick="post('destroy', { project: '${eName}' })">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1h2.5a1 1 0 0 1 1 1v1z"/></svg>
              Destroy Project
            </button>
          </div>
        </details>
      </div>`;

    card += `</div></div>`;
    return card;
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
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* ── Top bar ──────────────────────────── */

    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 28px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-widget-border);
    }

    .topbar-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.4px;
    }

    .brand-accent { color: #f59e0b; }

    .stats {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .stat-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 9px;
      border-radius: 16px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(74, 222, 128, 0.1);
      color: #4ade80;
    }

    .stat-pill.stat-total {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .stat-mini-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: currentColor;
    }

    .topbar-right {
      display: flex;
      gap: 6px;
    }

    .topbar-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 7px;
      background: transparent;
      color: var(--vscode-foreground);
      font-family: inherit;
      font-size: 11.5px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .topbar-btn:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
    }

    .topbar-btn-primary {
      background: #0078d4;
      color: #fff;
      border-color: #0078d4;
      font-weight: 600;
    }

    .topbar-btn-primary:hover { background: #1a8ae8; border-color: #1a8ae8; }

    /* ── Content ──────────────────────────── */

    .content {
      max-width: 880px;
      margin: 0 auto;
      padding: 20px 28px 40px;
    }

    /* ── Server banner ────────────────────── */

    .banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 7px;
      background: rgba(245, 158, 11, 0.05);
      border: 1px solid rgba(245, 158, 11, 0.12);
      margin-bottom: 20px;
      font-size: 12px;
      line-height: 1.4;
    }

    .banner-icon { flex-shrink: 0; font-size: 13px; }
    .banner strong { color: #f59e0b; }

    /* ── Card system ──────────────────────── */

    .card-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .card {
      border: 1px solid var(--vscode-widget-border);
      border-radius: 10px;
      overflow: hidden;
      transition: border-color 0.2s;
      animation: slideUp 0.3s ease-out both;
    }

    .card:nth-child(1) { animation-delay: 0s; }
    .card:nth-child(2) { animation-delay: 0.05s; }
    .card:nth-child(3) { animation-delay: 0.1s; }
    .card:nth-child(4) { animation-delay: 0.15s; }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .card:hover { border-color: var(--vscode-focusBorder); }

    .card.live { border-left: 3px solid #4ade80; }
    .card.failed { border-left: 3px solid #f87171; }
    .card.stopped { border-left: 3px solid #64748b; }

    /* ── Card header (collapsed view) ──────── */

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .card-header:hover { background: var(--vscode-list-hoverBackground); }

    .card-identity {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .dot {
      width: 9px; height: 9px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .dot.live {
      background: #4ade80;
      box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
      animation: glow 2s ease-in-out infinite;
    }

    .dot.failed { background: #f87171; }
    .dot.stopped { background: #64748b; }

    @keyframes glow {
      0%, 100% { box-shadow: 0 0 5px rgba(74, 222, 128, 0.3); }
      50% { box-shadow: 0 0 12px rgba(74, 222, 128, 0.6); }
    }

    .card-title-area {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .card-name {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: -0.2px;
    }

    .card-chips {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }

    .chip-status {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 1px 7px;
      border-radius: 3px;
    }

    .chip-status.live { background: rgba(74, 222, 128, 0.12); color: #4ade80; }
    .chip-status.failed { background: rgba(248, 113, 113, 0.12); color: #f87171; }
    .chip-status.stopped { background: rgba(100, 116, 139, 0.12); color: #94a3b8; }

    .chip-fw {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 1px 7px;
      border-radius: 3px;
      background: rgba(99, 102, 241, 0.1);
      color: #818cf8;
    }

    .chip-meta {
      font-size: 10.5px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.7;
    }

    .caret {
      color: var(--vscode-descriptionForeground);
      opacity: 0.35;
      transition: transform 0.2s;
      flex-shrink: 0;
    }

    .card.expanded .caret { transform: rotate(180deg); }

    /* ── URL bar (always visible for live) ──── */

    .url-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      background: rgba(245, 158, 11, 0.03);
      border-top: 1px solid var(--vscode-widget-border);
    }

    .url-link {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 13.5px;
      font-weight: 600;
      color: #f59e0b;
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 7px;
      background: rgba(245, 158, 11, 0.06);
      border: 1px solid rgba(245, 158, 11, 0.12);
      transition: all 0.15s;
      word-break: break-all;
      flex: 1;
    }

    .url-link:hover {
      background: rgba(245, 158, 11, 0.12);
      border-color: rgba(245, 158, 11, 0.25);
      color: #fbbf24;
    }

    .url-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .public-tag {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 3px 7px;
      border-radius: 3px;
      background: rgba(74, 222, 128, 0.1);
      color: #4ade80;
      flex-shrink: 0;
    }

    .qr-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px; height: 30px;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      transition: all 0.15s;
      flex-shrink: 0;
    }

    .qr-toggle:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
      color: var(--vscode-foreground);
    }

    .qr-panel {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 12px 18px 8px;
      border-top: 1px solid var(--vscode-widget-border);
      animation: fadeScale 0.2s ease-out;
    }

    .qr-panel.open { display: flex; }

    @keyframes fadeScale {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }

    .qr-frame {
      background: #fff;
      border-radius: 8px;
      padding: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    }

    .qr-frame img {
      display: block;
      width: 110px; height: 110px;
      image-rendering: pixelated;
    }

    .qr-label {
      font-size: 9.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.5;
    }

    /* ── Card body (expanded, hidden by default) ── */

    .card-body {
      display: none;
      flex-direction: column;
      gap: 0;
      border-top: 1px solid var(--vscode-widget-border);
      animation: expandDown 0.2s ease-out;
    }

    .card.expanded .card-body { display: flex; }

    @keyframes expandDown {
      from { opacity: 0; transform: translateY(-3px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ── Metric tiles (System Status style) ── */

    .metrics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--vscode-widget-border);
    }

    .metric {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 18px;
      background: var(--vscode-editor-background);
    }

    .metric-icon-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px; height: 28px;
      border-radius: 7px;
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
    }

    .metric-content {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .metric-value {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.2px;
      font-variant-numeric: tabular-nums;
    }

    .metric-label {
      font-size: 9.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.55;
    }

    /* ── Server note inline (inside live cards) ── */

    .server-note-inline {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 18px;
      background: rgba(245, 158, 11, 0.04);
      border-top: 1px solid var(--vscode-widget-border);
      font-size: 11.5px;
      line-height: 1.45;
      color: var(--vscode-descriptionForeground);
    }

    .sn-icon { flex-shrink: 0; font-size: 13px; }
    .server-note-inline strong { color: #f59e0b; }

    /* ── Local URL ────────────────────────── */

    .local-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 18px;
      border-top: 1px solid var(--vscode-widget-border);
      font-size: 12px;
    }

    .local-badge {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .local-link {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 11.5px;
    }

    .local-link:hover { text-decoration: underline; }

    /* ── Actions row ──────────────────────── */

    .actions-row {
      display: flex;
      gap: 5px;
      padding: 10px 18px;
      border-top: 1px solid var(--vscode-widget-border);
    }

    .action-btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 6px 10px;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      font-family: inherit;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .action-btn:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
      color: var(--vscode-foreground);
    }

    .action-warn { color: #fb923c; border-color: rgba(251, 146, 60, 0.2); }
    .action-warn:hover { background: rgba(251, 146, 60, 0.06); color: #f97316; border-color: rgba(251, 146, 60, 0.35); }

    /* ── Inline log viewer ────────────────── */

    .log-viewer {
      display: none;
      flex-direction: column;
      border-top: 1px solid var(--vscode-widget-border);
      animation: expandDown 0.2s ease-out;
    }

    .log-viewer.open { display: flex; }

    .log-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 18px;
      background: var(--vscode-sideBar-background);
    }

    .log-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--vscode-descriptionForeground);
    }

    .log-actions {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .log-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px; height: 22px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      transition: all 0.15s;
    }

    .log-action-btn:hover {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
    }

    .log-content {
      font-family: var(--vscode-editor-font-family), 'Cascadia Code', 'Fira Code', monospace;
      font-size: 11px;
      line-height: 1.5;
      padding: 10px 18px;
      max-height: 300px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-textCodeBlock-background);
    }

    .log-placeholder {
      opacity: 0.35;
      font-style: italic;
    }

    .log-content::-webkit-scrollbar { width: 5px; }
    .log-content::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 4px;
    }

    /* ── Deploy history ───────────────────── */

    .deploys-section {
      padding: 14px 18px;
      border-top: 1px solid var(--vscode-widget-border);
    }

    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
      opacity: 0.6;
    }

    .ship-metric {
      font-size: 20px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.5px;
      color: var(--vscode-foreground);
    }

    .deploys-table code {
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 10.5px;
      padding: 1px 4px;
      border-radius: 2px;
      background: var(--vscode-textCodeBlock-background);
    }

    .dep-dot-mini {
      display: inline-block;
      width: 5px; height: 5px;
      border-radius: 50%;
      margin-right: 5px;
    }

    .dep-ok .dep-dot-mini { background: #4ade80; }
    .dep-fail .dep-dot-mini { background: #f87171; }
    .dep-other .dep-dot-mini { background: #fbbf24; }

    /* ── Tunnel badge ─────────────────────── */

    .tunnel-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin: 10px 18px;
      padding: 5px 10px;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(74, 222, 128, 0.06);
      border: 1px solid rgba(74, 222, 128, 0.12);
      color: #4ade80;
    }

    .tunnel-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: #4ade80;
    }

    /* ── Danger zone ─────────────────────── */

    .danger-section {
      padding: 10px 18px;
      border-top: 1px solid var(--vscode-widget-border);
    }

    .danger-details summary { list-style: none; cursor: pointer; }
    .danger-details summary::-webkit-details-marker { display: none; }

    .danger-summary {
      font-size: 10.5px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      opacity: 0.35;
      transition: opacity 0.15s;
      padding: 2px 0;
    }

    .danger-summary::before { content: "\\25B8  "; font-size: 8px; }
    .danger-details[open] > .danger-summary::before { content: "\\25BE  "; }
    .danger-summary:hover { opacity: 0.6; }

    .danger-inner {
      padding: 10px 0 4px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .danger-text {
      font-size: 11.5px;
      color: #f87171;
      line-height: 1.5;
      opacity: 0.75;
    }

    .danger-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 14px;
      border: 1px solid rgba(248, 113, 113, 0.25);
      border-radius: 7px;
      background: rgba(248, 113, 113, 0.04);
      color: #f87171;
      font-family: inherit;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      width: fit-content;
    }

    .danger-btn:hover {
      background: rgba(248, 113, 113, 0.1);
      border-color: rgba(248, 113, 113, 0.4);
      color: #ef4444;
    }

    /* ── Empty state ──────────────────────── */

    .empty {
      text-align: center;
      padding: 60px 40px;
    }

    .empty-emoji { font-size: 42px; margin-bottom: 14px; }

    .empty h2 { font-size: 17px; font-weight: 700; margin-bottom: 6px; }

    .empty p {
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 20px;
      line-height: 1.6;
    }

    .empty-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 10px 24px;
      background: #0078d4;
      color: #fff;
      border: none;
      border-radius: 9px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
    }

    .empty-btn:hover { background: #1a8ae8; }

    /* ── Footer ───────────────────────────── */

    .footer {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 7px;
      padding: 20px 0 6px;
      font-size: 10.5px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.5;
    }

    .footer a {
      color: var(--vscode-descriptionForeground);
      text-decoration: none;
    }

    .footer a:hover { color: var(--vscode-textLink-foreground); }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-left">
      <span class="brand">Build <span class="brand-accent">&amp;</span> Ship</span>
      <div class="stats">
        <span class="stat-pill"><span class="stat-mini-dot"></span>${liveCount} live</span>
        <span class="stat-pill stat-total">${totalCount} projects</span>
      </div>
    </div>
    <div class="topbar-right">
      <button class="topbar-btn" onclick="post('refresh')">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg>
        Refresh
      </button>
      <button class="topbar-btn topbar-btn-primary" onclick="post('deploy')">Deploy</button>
    </div>
  </div>

  <div class="content">
    ${totalCount === 0 ? `
      <div class="empty">
        <div class="empty-emoji">\uD83D\uDE80</div>
        <h2>It's quiet in here...</h2>
        <p>Open a project folder and hit deploy.<br>We detect your framework, containerize it, and hand you a live URL.<br>Like magic, but with Docker.</p>
        <button class="empty-btn" onclick="post('deploy')">\uD83D\uDE80 Ship It</button>
      </div>
    ` : `<div class="card-grid">${projectCards}</div>`}

    <div class="footer">
      <a href="#" onclick="post('openUrl', { url: 'https://buildandship.it' })">buildandship.it</a>
      <span>\u00B7</span>
      <a href="#" onclick="post('openUrl', { url: 'https://buildandship.it/support' })">Support</a>
      <span>\u00B7</span>
      <span>Your hardware. Your rules. Zero cloud bills.</span>
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

    function toggleCard(card) {
      card.classList.toggle('expanded');
    }

    function toggleLogs(project) {
      const viewer = document.getElementById('panel-logs-' + project);
      if (!viewer) return;
      if (viewer.classList.contains('open')) {
        viewer.classList.remove('open');
      } else {
        post('viewLogs', { project: project });
      }
    }

    function copyLogs(project) {
      const viewer = document.getElementById('panel-logs-' + project);
      if (!viewer) return;
      const output = viewer.querySelector('.log-content');
      if (!output) return;
      const text = output.textContent || '';
      post('copyLogs', { text: text });
    }

    // Listen for log data
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'logsData' && msg.project) {
        const viewer = document.getElementById('panel-logs-' + msg.project);
        if (viewer) {
          viewer.classList.add('open');
          // Also expand the card if collapsed
          const card = viewer.closest('.card');
          if (card && !card.classList.contains('expanded')) {
            card.classList.add('expanded');
          }
          const output = viewer.querySelector('.log-content');
          if (output) {
            const escaped = msg.logs
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            output.innerHTML = escaped || '<span class="log-placeholder">No logs available</span>';
            output.scrollTop = output.scrollHeight;
          }
        }
      }
    });
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

function getErrorHtml(error: string): string {
  const safeError = error.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    .wrap { max-width: 380px; }
    .icon { font-size: 36px; margin-bottom: 14px; }
    h2 { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
    p { font-size: 12.5px; color: var(--vscode-descriptionForeground); line-height: 1.6; }
    .err {
      margin-top: 10px;
      padding: 7px 12px;
      border-radius: 5px;
      background: rgba(248, 113, 113, 0.06);
      border: 1px solid rgba(248, 113, 113, 0.15);
      color: #f87171;
      font-family: var(--vscode-editor-font-family), monospace;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="icon">\u26A0\uFE0F</div>
    <h2>Dashboard hit a wall</h2>
    <p>Make sure the <code>bs</code> CLI is installed and you're signed in. We can't show you cool stuff without it.</p>
    <div class="err">${safeError}</div>
  </div>
</body>
</html>`;
}
