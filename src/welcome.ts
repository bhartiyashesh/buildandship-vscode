/**
 * Welcome Webview — the first thing users see.
 *
 * Design philosophy: ONE action per screen. Zero thinking.
 *
 * State 1: No CLI  → "Install Build & Ship" (big button)
 * State 2: No auth → "Sign in with GitHub" (big button)
 * State 3: Ready   → "Deploy This Project" (big button)
 */

import * as vscode from "vscode";
import { isCliInstalled, isLoggedIn, listProjects, type ListProject } from "./cli.js";

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

    // Logged in — show projects
    try {
      const projects = await listProjects();
      return this.renderProjectsScreen(projects);
    } catch {
      return this.renderProjectsScreen([]);
    }
  }

  // ── State 1: Install CLI ────────────────────────────────────────

  private renderInstallScreen(): string {
    return this.wrap(/* html */ `
      <div class="hero">
        <div class="hero-icon">📦</div>
        <h1>Build & Ship</h1>
        <p class="subtitle">Deploy from your editor.<br>Zero DevOps. Your hardware.</p>
      </div>

      <div class="card">
        <div class="card-label">STEP 1 OF 2</div>
        <h2>Install the CLI</h2>
        <p>We'll install <code>bs</code> for you.<br>Takes about 10 seconds.</p>
        <button class="btn btn-primary full" onclick="post('install')">
          Install Build & Ship
        </button>
        <button class="btn btn-ghost full" onclick="post('refresh')">
          I've already installed it ↻
        </button>
      </div>
    `);
  }

  // ── State 2: Sign In ────────────────────────────────────────────

  private renderLoginScreen(): string {
    return this.wrap(/* html */ `
      <div class="hero">
        <div class="hero-icon">🔐</div>
        <h1>Almost there!</h1>
        <p class="subtitle">CLI installed. Now sign in.</p>
      </div>

      <div class="card">
        <div class="card-label">STEP 2 OF 2</div>
        <h2>Sign in with GitHub</h2>
        <p>We use GitHub to identify you.<br>No permissions needed beyond your profile.</p>
        <button class="btn btn-primary full" onclick="post('login')">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          Sign in with GitHub
        </button>
      </div>
    `);
  }

  // ── State 3: Projects ───────────────────────────────────────────

  private renderProjectsScreen(projects: ListProject[]): string {
    if (projects.length === 0) {
      return this.wrap(/* html */ `
        <div class="hero">
          <div class="hero-icon">🚀</div>
          <h1>Ready to ship!</h1>
          <p class="subtitle">You're all set up.<br>Deploy your first project.</p>
        </div>

        <div class="card">
          <h2>Deploy this project</h2>
          <p>Open a project folder, then hit deploy.<br>We'll handle everything.</p>
          <button class="btn btn-primary full" onclick="post('deploy')">
            🚀 Deploy
          </button>
        </div>

        <div class="hint">
          <strong>What happens:</strong><br>
          We detect your framework, build a container,<br>
          and give you a live URL. ~30 seconds.
        </div>
      `);
    }

    // Has projects — show them
    const projectCards = projects.map((p) => {
      const isLive = p.status === "live";
      const dot = isLive ? "●" : p.status === "failed" ? "✗" : "○";
      const dotClass = isLive ? "dot-live" : p.status === "failed" ? "dot-failed" : "dot-stopped";
      const url = p.public_url?.replace("https://", "") || "";

      return /* html */ `
        <div class="project-card">
          <div class="project-header">
            <span class="dot ${dotClass}">${dot}</span>
            <span class="project-name">${p.name}</span>
            <span class="project-status">${p.status}</span>
          </div>
          ${url ? `<a class="project-url" href="#" onclick="post('openUrl', '${p.public_url}')">${url}</a>` : ""}
          ${p.tunnel_active ? '<span class="badge">tunneled</span>' : ""}
          ${p.auto_deploy ? `<span class="badge">auto-deploy</span>` : ""}
        </div>`;
    }).join("");

    const liveCount = projects.filter((p) => p.status === "live").length;

    return this.wrap(/* html */ `
      <div class="header-row">
        <h1>Your Projects</h1>
        <button class="btn-icon" onclick="post('refresh')" title="Refresh">↻</button>
      </div>

      <div class="status-summary">
        <span class="dot dot-live">●</span> ${liveCount} live
        <span class="sep">·</span>
        ${projects.length} total
      </div>

      <div class="projects-list">
        ${projectCards}
      </div>

      <button class="btn btn-primary full" onclick="post('deploy')">
        🚀 Deploy This Project
      </button>

      <div class="quick-links">
        <a href="#" onclick="post('showPanel')">Dashboard</a>
      </div>
    `);
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
      padding: 16px 14px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* ── Hero ─────────────────────────────────── */

    .hero {
      text-align: center;
      padding: 20px 0 8px;
    }

    .hero-icon {
      font-size: 40px;
      margin-bottom: 10px;
      line-height: 1;
    }

    .hero h1 {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 6px;
    }

    .subtitle {
      font-size: 12.5px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
    }

    /* ── Cards ────────────────────────────────── */

    .card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .card-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: var(--vscode-textLink-foreground);
    }

    .card h2 {
      font-size: 15px;
      font-weight: 700;
    }

    .card p {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }

    .code-block {
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 6px;
      padding: 10px 12px;
      overflow-x: auto;
    }

    .code-block code {
      font-family: var(--vscode-editor-font-family);
      font-size: 11.5px;
      color: var(--vscode-textLink-foreground);
      white-space: nowrap;
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
      font-size: 16px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .btn-icon:hover {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
    }

    /* ── Projects list ────────────────────────── */

    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-row h1 {
      font-size: 15px;
      font-weight: 700;
    }

    .status-summary {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .sep { opacity: 0.4; }

    .projects-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .project-card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: border-color 0.15s;
    }

    .project-card:hover {
      border-color: var(--vscode-focusBorder);
    }

    .project-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .dot {
      font-size: 10px;
      line-height: 1;
    }

    .dot-live { color: #4ade80; }
    .dot-failed { color: #f87171; }
    .dot-stopped { color: #94a3b8; }

    .project-name {
      font-size: 13px;
      font-weight: 600;
      flex: 1;
    }

    .project-status {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .project-url {
      font-size: 11.5px;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      padding-left: 18px;
    }

    .project-url:hover { text-decoration: underline; }

    .badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      margin-left: 18px;
      width: fit-content;
    }

    /* ── Misc ─────────────────────────────────── */

    .hint {
      font-size: 11.5px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
      text-align: center;
      padding: 8px 0;
    }

    .hint strong {
      color: var(--vscode-foreground);
    }

    .quick-links {
      display: flex;
      justify-content: center;
      gap: 16px;
      padding: 4px 0;
    }

    .quick-links a {
      font-size: 11.5px;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }

    .quick-links a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  ${body}
  <script>
    const vscode = acquireVsCodeApi();
    function post(command, data) {
      if (typeof data === 'string') {
        vscode.postMessage({ command, url: data });
      } else {
        vscode.postMessage({ command, ...data });
      }
    }
  </script>
</body>
</html>`;
  }
}
