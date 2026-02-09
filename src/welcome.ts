/**
 * Welcome Webview — the first thing users see.
 *
 * Design philosophy: ONE action per screen. Celebrate deploys.
 *
 * State 1: No CLI  → "Install Build & Ship" (big button)
 * State 2: No auth → "Sign in with GitHub" (big button)
 * State 3: Ready   → Projects with live URLs, QR codes, and celebration
 */

import * as vscode from "vscode";
import { isCliInstalled, isLoggedIn, listProjects, statusAll, type ListProject, type StatusProject } from "./cli.js";

/** Merged view of list + status data for richer project cards */
interface ProjectView {
  name: string;
  status: string;
  public_url?: string;
  tunnel_active: boolean;
  auto_deploy?: { repo: string; branch: string };
  framework?: string;
  cpu?: string;
  memory?: string;
  uptime?: string;
}

export class WelcomeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "buildandship.welcome";
  private webviewView?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri) {}

  /** Call this to refresh the welcome view after state changes */
  async refresh(): Promise<void> {
    if (this.webviewView) {
      this.webviewView.webview.html = await this.getHtml();
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "login":
          await vscode.commands.executeCommand("buildandship.login");
          this.refresh();
          break;
        case "deploy":
          vscode.commands.executeCommand("buildandship.deploy");
          break;
        case "install":
          vscode.commands.executeCommand("buildandship.installCli");
          break;
        case "openUrl":
          vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;
        case "refresh":
          this.refresh();
          break;
        case "viewLogs":
          vscode.commands.executeCommand("buildandship.viewLogs", message.project);
          break;
        case "showPanel":
          vscode.commands.executeCommand("buildandship.showPanel");
          break;
        case "stop":
          vscode.commands.executeCommand("buildandship.stop", message.project);
          break;
        case "restart":
          vscode.commands.executeCommand("buildandship.restart", message.project);
          break;
      }
    });

    // Set initial content
    this.getHtml().then((html) => {
      webviewView.webview.html = html;
    });
  }

  private async getHtml(): Promise<string> {
    // Detect state
    const cliInstalled = await isCliInstalled();
    if (!cliInstalled) {
      return this.renderInstallScreen();
    }

    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      return this.renderLoginScreen();
    }

    // Logged in — merge list + status for rich cards
    try {
      const [projects, status] = await Promise.all([
        listProjects().catch(() => [] as ListProject[]),
        statusAll().catch(() => ({ projects: [] as StatusProject[] })),
      ]);

      // Merge status info into project list
      const statusMap = new Map(status.projects.map((s) => [s.name, s]));
      const views: ProjectView[] = projects.map((p) => {
        const s = statusMap.get(p.name);
        return {
          ...p,
          framework: s?.framework,
          cpu: s?.cpu,
          memory: s?.memory,
          uptime: s?.uptime,
        };
      });

      return this.renderProjectsScreen(views);
    } catch {
      return this.renderProjectsScreen([]);
    }
  }

  // ── State 1: Install CLI ────────────────────────────────────────

  private renderInstallScreen(): string {
    return this.wrap(/* html */ `
      <div class="screen-center">
        <div class="logo-mark">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#0078d4" opacity="0.15"/>
            <path d="M14 34V14h6l8 12V14h6v20h-6l-8-12v12h-6z" fill="#0078d4"/>
          </svg>
        </div>

        <h1 class="title-lg">Build & Ship</h1>
        <p class="subtitle">Deploy from your editor.<br>Zero DevOps. Your hardware.</p>

        <div class="card">
          <div class="step-badge">STEP 1 OF 2</div>
          <h2>Install the CLI</h2>
          <p class="card-desc">We'll install the <code>bs</code> command for you. Takes about 10 seconds.</p>
          <button class="btn btn-primary full" onclick="post('install')">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a.5.5 0 0 1 .5.5v9.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 11.293V1.5A.5.5 0 0 1 8 1z"/>
              <path d="M2 13.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
            </svg>
            Install Build & Ship
          </button>
          <button class="btn btn-ghost full" onclick="post('refresh')">
            I've already installed it ↻
          </button>
        </div>

        <div class="footer-link">
          <a href="#" onclick="post('openUrl', 'https://buildandship.it')">buildandship.it</a>
        </div>
      </div>
    `);
  }

  // ── State 2: Sign In ────────────────────────────────────────────

  private renderLoginScreen(): string {
    return this.wrap(/* html */ `
      <div class="screen-center">
        <div class="checklist">
          <div class="check-item check-done">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="#4ade80">
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.354 5.146a.5.5 0 0 0-.708 0L7 8.793 5.854 7.646a.5.5 0 1 0-.708.708l1.5 1.5a.5.5 0 0 0 .708 0l4-4a.5.5 0 0 0 0-.708z"/>
            </svg>
            <span>CLI Installed</span>
          </div>
          <div class="check-item check-current">
            <div class="check-circle">2</div>
            <span>Sign In</span>
          </div>
        </div>

        <h1 class="title-lg">Almost there!</h1>
        <p class="subtitle">One click to connect your identity.</p>

        <div class="card">
          <div class="step-badge">STEP 2 OF 2</div>
          <h2>Sign in with GitHub</h2>
          <p class="card-desc">We use GitHub for identity only.<br>No repo permissions needed.</p>
          <button class="btn btn-primary full" onclick="post('login')">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            Sign in with GitHub
          </button>
        </div>

        <div class="footer-link">
          <a href="#" onclick="post('openUrl', 'https://buildandship.it')">buildandship.it</a>
        </div>
      </div>
    `);
  }

  // ── State 3: Projects ───────────────────────────────────────────

  private renderProjectsScreen(projects: ProjectView[]): string {
    if (projects.length === 0) {
      return this.wrap(/* html */ `
        <div class="screen-center">
          <div class="hero-emoji">
            <span class="rocket-bounce">&#x1F680;</span>
          </div>

          <h1 class="title-lg">Ready to ship!</h1>
          <p class="subtitle">Your first deploy is ~30 seconds away.</p>

          <div class="card">
            <h2>Deploy this project</h2>
            <p class="card-desc">Open a project folder, hit deploy.<br>We detect, build, and give you a live URL.</p>
            <button class="btn btn-deploy full" onclick="post('deploy')">
              &#x1F680; Deploy This Project
            </button>
          </div>

          <div class="info-banner">
            <span class="info-icon">&#x26A1;</span>
            <span><strong>Your computer is the server.</strong><br>If you shut down, your site goes offline.</span>
          </div>

          <div class="footer-link">
            <a href="#" onclick="post('openUrl', 'https://buildandship.it')">buildandship.it</a>
            <span class="footer-sep">&middot;</span>
            <span class="footer-tagline">Your hardware. Your rules.</span>
          </div>
        </div>
      `);
    }

    // Has projects — build rich cards
    const liveCount = projects.filter((p) => p.status === "live").length;

    const projectCards = projects.map((p) => {
      const isLive = p.status === "live";
      const isFailed = p.status === "failed";
      const dotClass = isLive ? "dot-live" : isFailed ? "dot-failed" : "dot-stopped";
      const statusLabel = isLive ? "live" : isFailed ? "failed" : p.status;
      const statusClass = isLive ? "status-live" : isFailed ? "status-failed" : "status-other";
      const url = p.public_url?.replace("https://", "") || "";
      const fullUrl = p.public_url || "";

      let card = /* html */ `
        <div class="project-card ${isLive ? 'project-card-live' : ''}">
          <div class="project-header">
            <span class="status-dot ${dotClass}"></span>
            <span class="project-name">${this.escapeHtml(p.name)}</span>
            <span class="status-label ${statusClass}">${statusLabel}</span>
          </div>`;

      // Prominent public URL for live projects
      if (isLive && url) {
        card += /* html */ `
          <a class="public-url" href="#" onclick="post('openUrl', '${this.escapeHtml(fullUrl)}')">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity="0.6">
              <path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9.4A2 2 0 0 1 7 9.5H4a2 2 0 1 1 0-4h2.354z"/>
              <path d="M9.646 10.5H12a3 3 0 1 0 0-6H9a3 3 0 0 0-2.83 4h.44A2 2 0 0 1 9 6.5h3a2 2 0 1 1 0 4H9.646z"/>
            </svg>
            ${this.escapeHtml(url)}
            <svg class="external-icon" width="10" height="10" viewBox="0 0 16 16" fill="currentColor" opacity="0.4">
              <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>
              <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/>
            </svg>
          </a>`;

        // QR Code
        card += /* html */ `
          <div class="qr-section">
            <div class="qr-container">
              <img
                class="qr-code"
                src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&bgcolor=ffffff&color=000000&data=${encodeURIComponent(fullUrl)}"
                alt="QR Code"
                onerror="this.parentElement.style.display='none'"
              />
            </div>
            <span class="qr-label">Scan to visit</span>
          </div>`;
      }

      // Badges row
      const badges: string[] = [];
      if (p.framework) {
        badges.push(`<span class="badge badge-framework">${this.escapeHtml(p.framework)}</span>`);
      }
      if (p.tunnel_active) {
        badges.push('<span class="badge badge-tunnel">tunneled</span>');
      }
      if (p.auto_deploy) {
        badges.push('<span class="badge badge-auto">auto-deploy</span>');
      }
      if (badges.length > 0) {
        card += `<div class="badges-row">${badges.join("")}</div>`;
      }

      // Meta info (uptime, resources)
      if (isLive && (p.uptime || p.cpu || p.memory)) {
        const meta: string[] = [];
        if (p.uptime) { meta.push(`Up ${p.uptime}`); }
        if (p.cpu) { meta.push(`CPU ${p.cpu}`); }
        if (p.memory) { meta.push(`RAM ${p.memory}`); }
        card += `<div class="project-meta">${meta.join(" &middot; ")}</div>`;
      }

      // Quick actions
      card += /* html */ `
          <div class="quick-actions">
            <a href="#" onclick="post('viewLogs', {project:'${this.escapeHtml(p.name)}'})">Logs</a>
            <span class="action-sep">&middot;</span>
            <a href="#" onclick="post('restart', {project:'${this.escapeHtml(p.name)}'})">Restart</a>
            <span class="action-sep">&middot;</span>
            <a href="#" onclick="post('stop', {project:'${this.escapeHtml(p.name)}'})">Stop</a>
          </div>`;

      card += `</div>`;
      return card;
    }).join("");

    return this.wrap(/* html */ `
      <div class="header-bar">
        <div class="header-left">
          <h1 class="header-title">Build & Ship</h1>
          <a class="header-link" href="#" onclick="post('openUrl', 'https://buildandship.it')">buildandship.it</a>
        </div>
        <button class="btn-icon" onclick="post('refresh')" title="Refresh">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/>
            <path d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/>
          </svg>
        </button>
      </div>

      <div class="status-bar">
        <span class="status-dot dot-live"></span>
        <span>${liveCount} live</span>
        <span class="status-sep">&middot;</span>
        <span>${projects.length} total</span>
      </div>

      <div class="info-banner">
        <span class="info-icon">&#x26A1;</span>
        <span><strong>Your computer is the server.</strong> If you shut down, your site goes offline.</span>
      </div>

      <div class="projects-list">
        ${projectCards}
      </div>

      <button class="btn btn-deploy full" onclick="post('deploy')">
        &#x1F680; Deploy This Project
      </button>

      <div class="quick-links">
        <a href="#" onclick="post('showPanel')">Dashboard</a>
        <span class="footer-sep">&middot;</span>
        <a href="#" onclick="post('openUrl', 'https://buildandship.it')">buildandship.it</a>
      </div>

      <div class="footer-tagline">Your hardware. Your rules.</div>
    `);
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ── HTML wrapper with shared styles ─────────────────────────────

  private wrap(body: string): string {
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
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 100vh;
    }

    /* ── Layout ──────────────────────────────── */

    .screen-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding-top: 12px;
    }

    /* ── Logo & Hero ─────────────────────────── */

    .logo-mark {
      margin-bottom: 4px;
    }

    .title-lg {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      text-align: center;
    }

    .subtitle {
      font-size: 12.5px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
      text-align: center;
    }

    .hero-emoji {
      font-size: 44px;
      line-height: 1;
      margin-bottom: 2px;
    }

    @keyframes rocketBounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }

    .rocket-bounce {
      display: inline-block;
      animation: rocketBounce 2s ease-in-out infinite;
    }

    /* ── Checklist (login screen) ────────────── */

    .checklist {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      max-width: 220px;
      margin-bottom: 4px;
    }

    .check-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      font-weight: 500;
    }

    .check-done {
      color: #4ade80;
    }

    .check-current {
      color: var(--vscode-foreground);
    }

    .check-circle {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
    }

    /* ── Cards ────────────────────────────────── */

    .card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }

    .step-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: var(--vscode-textLink-foreground);
    }

    .card h2 {
      font-size: 14px;
      font-weight: 700;
    }

    .card-desc {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }

    .card-desc code {
      font-family: var(--vscode-editor-font-family);
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 11.5px;
    }

    /* ── Buttons ──────────────────────────────── */

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: var(--vscode-font-family);
    }

    .btn:hover { filter: brightness(1.1); }
    .btn:active { transform: scale(0.98); }
    .full { width: 100%; }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-deploy {
      background: #0078d4;
      color: #fff;
      padding: 12px 16px;
      font-size: 14px;
      font-weight: 700;
      border-radius: 10px;
      letter-spacing: 0.2px;
    }

    .btn-deploy:hover {
      background: #1a8ae8;
    }

    .btn-ghost {
      background: transparent;
      color: var(--vscode-descriptionForeground);
      font-size: 11.5px;
      font-weight: 500;
      padding: 6px 12px;
    }

    .btn-ghost:hover {
      color: var(--vscode-foreground);
      background: var(--vscode-list-hoverBackground);
    }

    .btn-icon {
      background: none;
      border: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      padding: 5px 7px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }

    .btn-icon:hover {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
    }

    /* ── Header bar (projects screen) ────────── */

    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 2px;
    }

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .header-title {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }

    .header-link {
      font-size: 10.5px;
      color: var(--vscode-descriptionForeground);
      text-decoration: none;
      opacity: 0.7;
      cursor: pointer;
    }

    .header-link:hover {
      color: var(--vscode-textLink-foreground);
      opacity: 1;
    }

    /* ── Status bar ──────────────────────────── */

    .status-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .status-sep { opacity: 0.4; }

    /* ── Info banner ─────────────────────────── */

    .info-banner {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.2);
      font-size: 11.5px;
      line-height: 1.5;
      color: var(--vscode-foreground);
      width: 100%;
    }

    .info-icon {
      flex-shrink: 0;
      font-size: 14px;
      line-height: 1.3;
    }

    .info-banner strong {
      color: #f59e0b;
    }

    /* ── Projects list ────────────────────────── */

    .projects-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .project-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 10px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .project-card:hover {
      border-color: var(--vscode-focusBorder);
    }

    .project-card-live {
      border-color: rgba(74, 222, 128, 0.2);
    }

    .project-card-live:hover {
      border-color: rgba(74, 222, 128, 0.4);
      box-shadow: 0 0 0 1px rgba(74, 222, 128, 0.1);
    }

    /* ── Project header ──────────────────────── */

    .project-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .dot-live {
      background: #4ade80;
      box-shadow: 0 0 6px rgba(74, 222, 128, 0.5);
      animation: pulse-green 2s ease-in-out infinite;
    }

    .dot-failed { background: #f87171; }
    .dot-stopped { background: #64748b; }

    @keyframes pulse-green {
      0%, 100% { box-shadow: 0 0 4px rgba(74, 222, 128, 0.4); }
      50% { box-shadow: 0 0 10px rgba(74, 222, 128, 0.7); }
    }

    .project-name {
      font-size: 13px;
      font-weight: 700;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 7px;
      border-radius: 4px;
    }

    .status-live {
      background: rgba(74, 222, 128, 0.15);
      color: #4ade80;
    }

    .status-failed {
      background: rgba(248, 113, 113, 0.15);
      color: #f87171;
    }

    .status-other {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    /* ── Public URL (the star of the show!) ──── */

    .public-url {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      color: #f59e0b;
      text-decoration: none;
      padding: 6px 10px;
      border-radius: 6px;
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.15);
      transition: all 0.15s;
      word-break: break-all;
    }

    .public-url:hover {
      background: rgba(245, 158, 11, 0.14);
      border-color: rgba(245, 158, 11, 0.3);
      color: #fbbf24;
    }

    .external-icon {
      flex-shrink: 0;
      margin-left: auto;
    }

    /* ── QR Code ─────────────────────────────── */

    .qr-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 6px 0 2px;
    }

    .qr-container {
      background: #ffffff;
      border-radius: 8px;
      padding: 8px;
      display: inline-flex;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
    }

    .qr-code {
      width: 100px;
      height: 100px;
      display: block;
      image-rendering: pixelated;
    }

    .qr-label {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.8px;
      font-weight: 600;
    }

    /* ── Badges ───────────────────────────────── */

    .badges-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 2px 7px;
      border-radius: 4px;
    }

    .badge-framework {
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
    }

    .badge-tunnel {
      background: rgba(14, 165, 233, 0.15);
      color: #38bdf8;
    }

    .badge-auto {
      background: rgba(168, 85, 247, 0.15);
      color: #c084fc;
    }

    /* ── Project meta ────────────────────────── */

    .project-meta {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.8;
    }

    /* ── Quick actions ────────────────────────── */

    .quick-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-top: 2px;
      border-top: 1px solid var(--vscode-widget-border);
      margin-top: 2px;
    }

    .quick-actions a {
      font-size: 11px;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
      transition: background 0.1s;
    }

    .quick-actions a:hover {
      background: var(--vscode-list-hoverBackground);
      text-decoration: none;
    }

    .action-sep {
      color: var(--vscode-descriptionForeground);
      opacity: 0.3;
      font-size: 10px;
    }

    /* ── Footer & links ──────────────────────── */

    .quick-links {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }

    .quick-links a {
      font-size: 11.5px;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }

    .quick-links a:hover { text-decoration: underline; }

    .footer-link {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 0 0;
    }

    .footer-link a {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-decoration: none;
      opacity: 0.7;
      cursor: pointer;
    }

    .footer-link a:hover {
      color: var(--vscode-textLink-foreground);
      opacity: 1;
    }

    .footer-sep {
      color: var(--vscode-descriptionForeground);
      opacity: 0.3;
    }

    .footer-tagline {
      font-size: 10.5px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      opacity: 0.6;
      font-weight: 500;
      letter-spacing: 0.2px;
    }

    /* ── Fade-in animation ───────────────────── */

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .project-card {
      animation: fadeIn 0.3s ease-out both;
    }

    .project-card:nth-child(1) { animation-delay: 0s; }
    .project-card:nth-child(2) { animation-delay: 0.05s; }
    .project-card:nth-child(3) { animation-delay: 0.1s; }
    .project-card:nth-child(4) { animation-delay: 0.15s; }
    .project-card:nth-child(5) { animation-delay: 0.2s; }

    .card {
      animation: fadeIn 0.3s ease-out both;
    }

    .info-banner {
      animation: fadeIn 0.4s ease-out 0.1s both;
    }
  </style>
</head>
<body>
  ${body}
  <script>
    const vscode = acquireVsCodeApi();
    function post(command, data) {
      if (typeof data === 'string') {
        vscode.postMessage({ command, url: data });
      } else if (typeof data === 'object') {
        vscode.postMessage({ command, ...data });
      } else {
        vscode.postMessage({ command });
      }
    }
  </script>
</body>
</html>`;
  }
}
