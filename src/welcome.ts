/**
 * Welcome Webview — the first thing users see.
 *
 * Design: Inspired by System Status (macOS) — clean, elegant, modern, classy.
 *
 * Key UX decisions:
 *   - Project cards are COLLAPSED by default (name + status + URL only)
 *   - Click to EXPAND and see details (metrics, logs, deploy history, actions)
 *   - Inline log viewer — logs show inside the extension, not in a terminal
 *   - System Status-style metric tiles with clear labels
 *   - Subtle glassmorphism cards with refined typography
 *
 * State 1: No CLI  → "Install Build & Ship" (big button)
 * State 2: No auth → "Sign in with GitHub" (big button)
 * State 3: Ready   → Projects with expandable cards
 */

import * as vscode from "vscode";
import { isCliInstalled, isLoggedIn, listProjects, statusAll, statusDetail, getLogs, type ListProject, type StatusProject, type StatusDetail } from "./cli.js";

/** Merged view of list + status + detail data for rich project cards */
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
  local_url?: string;
  net?: string;
  deploys?: { id: string; status: string; commit_sha?: string; duration_ms?: number; created_at: string }[];
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

  /** Trigger confetti celebration after a successful deploy */
  celebrate(projectName: string, publicUrl: string): void {
    if (this.webviewView) {
      this.webviewView.webview.postMessage({
        command: "celebrate",
        project: projectName,
        url: publicUrl,
      });
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
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "resources")],
    };

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "login":
          await vscode.commands.executeCommand("buildandship.login");
          this.refresh();
          break;
        case "deploy": {
          // Check auth before deploying — if not logged in, show login screen
          const authed = await isLoggedIn();
          if (!authed) {
            this.refresh(); // Will re-render and show login screen
            return;
          }
          vscode.commands.executeCommand("buildandship.deploy");
          break;
        }
        case "install":
          vscode.commands.executeCommand("buildandship.installCli");
          break;
        case "openUrl":
          vscode.env.openExternal(vscode.Uri.parse(message.url));
          break;
        case "refresh":
          this.refresh();
          break;
        case "viewLogs": {
          // Fetch logs and send them back to the webview for inline display
          const logs = await getLogs(message.project, 80);
          if (this.webviewView) {
            this.webviewView.webview.postMessage({
              command: "logsData",
              project: message.project,
              logs,
            });
          }
          break;
        }
        case "copyLogs": {
          // Copy log text to clipboard
          if (message.text) {
            await vscode.env.clipboard.writeText(message.text);
            vscode.window.showInformationMessage("Logs copied to clipboard.");
          }
          break;
        }
        case "showPanel":
          vscode.commands.executeCommand("buildandship.showPanel");
          break;
        case "stop":
          vscode.commands.executeCommand("buildandship.stop", message.project);
          setTimeout(() => this.refresh(), 3000);
          break;
        case "restart":
          vscode.commands.executeCommand("buildandship.restart", message.project);
          setTimeout(() => this.refresh(), 5000);
          break;
        case "destroy":
          vscode.commands.executeCommand("buildandship.destroy", message.project);
          setTimeout(() => this.refresh(), 3000);
          break;
      }
    });

    // Set initial content
    this.getHtml().then((html) => {
      webviewView.webview.html = html;
    });
  }

  private getIconUri(): string {
    if (!this.webviewView) { return ""; }
    const iconPath = vscode.Uri.joinPath(this.extensionUri, "resources", "icon.png");
    return this.webviewView.webview.asWebviewUri(iconPath).toString();
  }

  private async getHtml(): Promise<string> {
    const iconUri = this.getIconUri();

    // Detect state
    const cliInstalled = await isCliInstalled();
    if (!cliInstalled) {
      return this.renderInstallScreen(iconUri);
    }

    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      return this.renderLoginScreen(iconUri);
    }

    // Logged in — merge list + status + detail for rich cards
    try {
      const [projects, status] = await Promise.all([
        listProjects().catch(() => [] as ListProject[]),
        statusAll().catch(() => ({ projects: [] as StatusProject[] })),
      ]);

      // Merge status info into project list
      const statusMap = new Map(status.projects.map((s) => [s.name, s]));

      // Fetch details in parallel for expanded data
      const detailResults = await Promise.all(
        projects.map((p) => statusDetail(p.name).catch(() => null))
      );
      const detailMap = new Map<string, StatusDetail>();
      detailResults.forEach((d) => { if (d) { detailMap.set(d.name, d); } });

      const views: ProjectView[] = projects.map((p) => {
        const s = statusMap.get(p.name);
        const d = detailMap.get(p.name);
        return {
          ...p,
          framework: s?.framework || d?.framework,
          cpu: d?.resources?.cpu || s?.cpu,
          memory: d?.resources?.memory || s?.memory,
          net: d?.resources?.net,
          uptime: s?.uptime || d?.uptime,
          local_url: d?.local_url,
          deploys: d?.deploys,
        };
      });

      return this.renderProjectsScreen(views);
    } catch {
      return this.renderProjectsScreen([]);
    }
  }

  // ── State 1: Install CLI ────────────────────────────────────────

  private renderInstallScreen(iconUri: string): string {
    return this.wrap(/* html */ `
      <div class="screen-center">
        <div class="logo-area">
          <img class="logo-img" src="${iconUri}" alt="Build & Ship" />
        </div>

        <h1 class="title-lg">Build & Ship</h1>
        <p class="subtitle">Deploy from your editor.<br>Zero DevOps. Your hardware.</p>

        <div class="onboard-card">
          <div class="step-indicator">
            <span class="step active">1</span>
            <span class="step-line"></span>
            <span class="step">2</span>
          </div>
          <h2>Install the CLI</h2>
          <p class="card-desc">Installs the <code>bs</code> command.<br>Faster than your coffee order.</p>
          <button class="btn btn-primary full" onclick="post('install')">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a.5.5 0 0 1 .5.5v9.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 11.293V1.5A.5.5 0 0 1 8 1z"/><path d="M2 13.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/></svg>
            Install Build & Ship
          </button>
          <button class="btn btn-ghost full" onclick="post('refresh')">Already installed, just flexing ↻</button>
        </div>

        <div class="footer-link">
          <a href="#" onclick="post('openUrl', 'https://buildandship.it')">buildandship.it</a>
        </div>
      </div>
    `);
  }

  // ── State 2: Sign In ────────────────────────────────────────────

  private renderLoginScreen(iconUri: string): string {
    return this.wrap(/* html */ `
      <div class="screen-center">
        <div class="progress-steps">
          <div class="p-step done">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="#4ade80"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm3.354 5.146a.5.5 0 0 0-.708 0L7 8.793 5.854 7.646a.5.5 0 1 0-.708.708l1.5 1.5a.5.5 0 0 0 .708 0l4-4a.5.5 0 0 0 0-.708z"/></svg>
            <span>CLI Installed</span>
          </div>
          <div class="p-step current">
            <div class="step-num">2</div>
            <span>Sign In</span>
          </div>
        </div>

        <h1 class="title-lg">One more thing.</h1>
        <p class="subtitle">Sign in so we know who to congratulate<br>when your deploy goes live.</p>

        <div class="auth-banner">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" opacity="0.5"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>
          <span>Not signed in</span>
        </div>

        <div class="onboard-card">
          <h2>Sign in with GitHub</h2>
          <p class="card-desc">Identity only. We don't touch your repos.<br>Pinky promise.</p>
          <button class="btn btn-primary full" onclick="post('login')">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
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
          <div class="hero-icon">
            <span class="rocket-float">&#x1F680;</span>
          </div>

          <h1 class="title-lg">Launch sequence ready.</h1>
          <p class="subtitle">Your first deploy is ~30 seconds away.<br>We timed it.</p>

          <div class="onboard-card">
            <p class="card-desc">Open a project folder, hit deploy.<br>We figure out the rest. You get a live URL.</p>
            <button class="btn btn-deploy full" onclick="post('deploy')">&#x1F680; Ship It</button>
          </div>

          <div class="footer-link">
            <a href="#" onclick="post('openUrl', 'https://buildandship.it')">buildandship.it</a>
            <span class="sep">&middot;</span>
            <span class="tagline">No cloud bills. Just vibes.</span>
          </div>
        </div>
      `);
    }

    // Has projects — build collapsible cards
    const liveCount = projects.filter((p) => p.status === "live").length;

    const projectCards = projects.map((p, idx) => {
      const isLive = p.status === "live";
      const isFailed = p.status === "failed";
      const isStopped = p.status === "stopped" || p.status === "exited";
      const statusClass = isLive ? "live" : isFailed ? "failed" : "stopped";
      const statusLabel = isLive ? "live" : isFailed ? "failed" : p.status;
      const url = p.public_url?.replace("https://", "") || "";
      const fullUrl = p.public_url || "";
      const eName = this.escapeHtml(p.name);

      // ── Collapsed view (always visible) ───────────
      let card = /* html */ `
        <div class="project-card ${statusClass}" data-project="${eName}" style="animation-delay: ${idx * 0.04}s">
          <div class="card-collapsed" onclick="toggleCard(this.parentElement)">
            <div class="card-left">
              <span class="indicator ${statusClass}"></span>
              <div class="card-info">
                <span class="card-name">${eName}</span>
                <span class="card-status ${statusClass}">${statusLabel}</span>
              </div>
            </div>
            <svg class="chevron" width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708z"/></svg>
          </div>`;

      // URL row (visible even when collapsed, for live projects)
      if (isLive && url) {
        card += /* html */ `
          <div class="url-strip">
            <a class="live-url" href="#" onclick="event.stopPropagation(); post('openUrl', '${this.escapeHtml(fullUrl)}')">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" opacity="0.5"><path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/><path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243L6.586 4.672z"/></svg>
              <span class="url-text">${this.escapeHtml(url)}</span>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" opacity="0.3"><path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>
            </a>
            <span class="public-pill">Public</span>
            <button class="qr-btn" onclick="event.stopPropagation(); this.closest('.project-card').querySelector('.qr-drawer').classList.toggle('open')" title="QR Code">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M0 .5A.5.5 0 0 1 .5 0h3a.5.5 0 0 1 0 1H1v2.5a.5.5 0 0 1-1 0v-3zm12 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-1 0V1h-2.5a.5.5 0 0 1-.5-.5zM.5 12a.5.5 0 0 1 .5.5V15h2.5a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H15v-2.5a.5.5 0 0 1 .5-.5z"/></svg>
            </button>
          </div>
          <div class="qr-drawer">
            <div class="qr-frame">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&bgcolor=ffffff&color=000000&data=${encodeURIComponent(fullUrl)}" alt="QR" onerror="this.closest('.qr-drawer').style.display='none'" />
            </div>
            <span class="qr-caption">Point phone here. Magic.</span>
          </div>`;
      }

      // ── Expanded view (hidden by default) ─────────
      card += `<div class="card-expanded">`;

      // Metric tiles (System Status inspired)
      if (isLive && (p.cpu || p.memory || p.uptime)) {
        card += `<div class="metrics-grid">`;
        if (p.cpu) {
          card += /* html */ `
            <div class="metric-tile">
              <span class="metric-icon">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity="0.5"><path d="M5 0a.5.5 0 0 1 .5.5V2h1V.5a.5.5 0 0 1 1 0V2h1V.5a.5.5 0 0 1 1 0V2h1V.5a.5.5 0 0 1 1 0V2A2.5 2.5 0 0 1 14 4.5h1.5a.5.5 0 0 1 0 1H14v1h1.5a.5.5 0 0 1 0 1H14v1h1.5a.5.5 0 0 1 0 1H14v1h1.5a.5.5 0 0 1 0 1H14a2.5 2.5 0 0 1-2.5 2.5v1.5a.5.5 0 0 1-1 0V14h-1v1.5a.5.5 0 0 1-1 0V14h-1v1.5a.5.5 0 0 1-1 0V14h-1v1.5a.5.5 0 0 1-1 0V14A2.5 2.5 0 0 1 2 11.5H.5a.5.5 0 0 1 0-1H2v-1H.5a.5.5 0 0 1 0-1H2v-1H.5a.5.5 0 0 1 0-1H2v-1H.5a.5.5 0 0 1 0-1H2A2.5 2.5 0 0 1 4.5 2V.5A.5.5 0 0 1 5 0zm-.5 3A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 11.5 3h-7zM5 6.5A1.5 1.5 0 0 1 6.5 5h3A1.5 1.5 0 0 1 11 6.5v3A1.5 1.5 0 0 1 9.5 11h-3A1.5 1.5 0 0 1 5 9.5v-3z"/></svg>
              </span>
              <div class="metric-data">
                <span class="metric-val">${this.escapeHtml(p.cpu)}</span>
                <span class="metric-lbl">CPU</span>
              </div>
            </div>`;
        }
        if (p.memory) {
          card += /* html */ `
            <div class="metric-tile">
              <span class="metric-icon">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity="0.5"><path d="M1 3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h4.586a1 1 0 0 0 .707-.293l.353-.353a.5.5 0 0 1 .708 0l.353.353a1 1 0 0 0 .707.293H15a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H1zm2 1a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V5a1 1 0 0 1 1-1zm4 0a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1zm4 0a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1z"/></svg>
              </span>
              <div class="metric-data">
                <span class="metric-val">${this.escapeHtml(p.memory)}</span>
                <span class="metric-lbl">Memory</span>
              </div>
            </div>`;
        }
        if (p.uptime) {
          card += /* html */ `
            <div class="metric-tile">
              <span class="metric-icon">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity="0.5"><path d="M8 3.5a.5.5 0 0 0-1 0V8a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 7.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
              </span>
              <div class="metric-data">
                <span class="metric-val">${this.escapeHtml(p.uptime)}</span>
                <span class="metric-lbl">Uptime</span>
              </div>
            </div>`;
        }
        if (p.net) {
          card += /* html */ `
            <div class="metric-tile">
              <span class="metric-icon">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity="0.5"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 0 0 5.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 0 1 .64-1.539 6.7 6.7 0 0 1 .597-.933A7.025 7.025 0 0 0 2.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 0 0-.656 2.5h2.49z"/></svg>
              </span>
              <div class="metric-data">
                <span class="metric-val">${this.escapeHtml(p.net)}</span>
                <span class="metric-lbl">Network</span>
              </div>
            </div>`;
        }
        card += `</div>`;
      }

      // Server warning (only for live projects)
      if (isLive) {
        card += /* html */ `
          <div class="server-note-inline">
            <span class="note-icon">&#x26A1;</span>
            <span><strong>Your machine is the server.</strong> Shut it down and your site naps too. VS Code can close though &mdash; we run in the background like your best work.</span>
          </div>`;
      }

      // Badges
      const badges: string[] = [];
      if (p.framework) {
        badges.push(`<span class="chip chip-framework">${this.escapeHtml(p.framework)}</span>`);
      }
      if (p.auto_deploy) {
        badges.push(`<span class="chip chip-auto">auto-deploy</span>`);
      }
      if (p.local_url) {
        badges.push(`<span class="chip chip-local">${this.escapeHtml(p.local_url)}</span>`);
      }
      if (badges.length > 0) {
        card += `<div class="chips-row">${badges.join("")}</div>`;
      }

      // Action buttons
      card += `<div class="actions-bar">`;
      if (isLive) {
        card += /* html */ `
          <button class="act-btn" onclick="event.stopPropagation(); toggleLogs('${eName}')">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z"/></svg>
            Logs
          </button>
          <button class="act-btn" onclick="event.stopPropagation(); post('restart', {project:'${eName}'})">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg>
            Restart
          </button>
          <button class="act-btn act-warn" onclick="event.stopPropagation(); post('stop', {project:'${eName}'})">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/></svg>
            Stop
          </button>`;
      } else if (isStopped || isFailed) {
        card += /* html */ `
          <button class="act-btn" onclick="event.stopPropagation(); toggleLogs('${eName}')">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z"/></svg>
            Logs
          </button>
          <button class="act-btn" onclick="event.stopPropagation(); post('restart', {project:'${eName}'})">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg>
            Restart
          </button>`;
      }
      card += `</div>`;

      // Inline log viewer (hidden by default, filled via postMessage)
      card += /* html */ `
        <div class="log-viewer" id="logs-${eName}">
          <div class="log-header">
            <span class="log-title">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" opacity="0.5"><path d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/><path d="M5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z"/></svg>
              Logs
            </span>
            <div class="log-actions">
              <button class="log-action-btn" onclick="event.stopPropagation(); copyLogs('${eName}')" title="Copy logs">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>
              </button>
              <button class="log-action-btn" onclick="event.stopPropagation(); document.getElementById('logs-${eName}').classList.remove('open')" title="Close logs">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
              </button>
            </div>
          </div>
          <pre class="log-output"><span class="log-placeholder">Hit "Logs" to see what your app is thinking...</span></pre>
        </div>`;

      // Latest deploy (single metric)
      if (p.deploys && p.deploys.length > 0) {
        const latest = p.deploys[0];
        const duration = latest.duration_ms ? `${(latest.duration_ms / 1000).toFixed(1)}s` : "\u2014";
        card += /* html */ `
          <div class="deploys-mini">
            <span class="section-lbl">Ship Log</span>
            <span class="ship-metric">${duration}</span>
          </div>`;
      }

      // Danger zone
      card += /* html */ `
        <details class="danger-zone" onclick="event.stopPropagation()">
          <summary class="danger-toggle">Danger Zone</summary>
          <div class="danger-body">
            <p class="danger-msg">Permanently delete <strong>${eName}</strong>. This cannot be undone.</p>
            <button class="act-btn act-danger" onclick="post('destroy', {project:'${eName}'})">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1h2.5a1 1 0 0 1 1 1v1z"/></svg>
              Destroy
            </button>
          </div>
        </details>`;

      card += `</div></div>`; // close card-expanded and project-card
      return card;
    }).join("");

    return this.wrap(/* html */ `
      <div class="top-bar">
        <div class="top-left">
          <span class="brand">Build & Ship</span>
          <a class="brand-link" href="#" onclick="post('openUrl', 'https://buildandship.it')">buildandship.it</a>
        </div>
        <button class="icon-btn" onclick="post('refresh')" title="Refresh">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg>
        </button>
      </div>

      <div class="stats-row">
        <div class="stat-chip live"><span class="stat-dot"></span>${liveCount} live</div>
        <div class="stat-chip total">${projects.length} total</div>
      </div>

      <button class="btn btn-deploy full" onclick="post('deploy')">&#x1F680; Ship It</button>

      <div class="projects-list">
        ${projectCards}
      </div>

      <div class="bottom-links">
        <a href="#" onclick="post('showPanel')">Dashboard</a>
        <span class="sep">&middot;</span>
        <a href="#" onclick="post('openUrl', 'https://buildandship.it')">buildandship.it</a>
        <span class="sep">&middot;</span>
        <a href="#" onclick="post('openUrl', 'https://buildandship.it/support')">Support</a>
      </div>
      <div class="tagline">Your hardware. Your rules. Zero cloud bills.</div>
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', var(--vscode-font-family), system-ui, sans-serif;
      color: var(--vscode-foreground);
      padding: 14px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Layout ──────────────────────────── */

    .screen-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding-top: 10px;
    }

    /* ── Logo & onboarding ───────────────── */

    .logo-area {
      margin-bottom: 2px;
    }

    .logo-img {
      width: 64px;
      height: 64px;
      object-fit: contain;
      border-radius: 12px;
    }

    .title-lg {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.5px;
      text-align: center;
    }

    .subtitle {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
      text-align: center;
    }

    .hero-icon { font-size: 38px; line-height: 1; margin-bottom: 2px; }

    @keyframes rocketFloat {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }
    .rocket-float { display: inline-block; animation: rocketFloat 2.5s ease-in-out infinite; }

    /* ── Step indicators ─────────────────── */

    .step-indicator {
      display: flex;
      align-items: center;
      gap: 0;
      margin-bottom: 6px;
    }

    .step {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .step.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .step-line {
      width: 28px;
      height: 1px;
      background: var(--vscode-widget-border);
    }

    .progress-steps {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
      max-width: 200px;
    }

    .p-step {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 500;
    }

    .p-step.done { color: #4ade80; }
    .p-step.current { color: var(--vscode-foreground); }

    .step-num {
      width: 16px; height: 16px; border-radius: 50%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 700;
    }

    /* ── Auth banner ──────────────────────── */

    .auth-banner {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 8px 14px;
      border-radius: 8px;
      background: rgba(248, 113, 113, 0.08);
      border: 1px solid rgba(248, 113, 113, 0.2);
      font-size: 12px;
      font-weight: 600;
      color: #f87171;
      width: 100%;
      justify-content: center;
      animation: fadeIn 0.3s ease-out;
    }

    /* ── Onboard card ────────────────────── */

    .onboard-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 10px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      animation: fadeIn 0.3s ease-out;
    }

    .onboard-card h2 { font-size: 13px; font-weight: 700; }

    .card-desc {
      font-size: 11.5px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }

    .card-desc code {
      font-family: var(--vscode-editor-font-family);
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 11px;
    }

    /* ── Buttons ──────────────────────────── */

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 9px 14px;
      border: none;
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
    }

    .btn:hover { filter: brightness(1.08); }
    .btn:active { transform: scale(0.98); }
    .full { width: 100%; }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-deploy {
      background: #0078d4;
      color: #fff;
      padding: 11px 14px;
      font-size: 13px;
      font-weight: 700;
      border-radius: 10px;
    }

    .btn-deploy:hover { background: #1a8ae8; }

    .btn-ghost {
      background: transparent;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 500;
      padding: 5px 10px;
    }

    .btn-ghost:hover {
      color: var(--vscode-foreground);
      background: var(--vscode-list-hoverBackground);
    }

    .icon-btn {
      background: none; border: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer; padding: 4px 6px;
      border-radius: 5px;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
    }

    .icon-btn:hover {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
    }

    /* ── Top bar ──────────────────────────── */

    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 2px;
    }

    .top-left { display: flex; flex-direction: column; gap: 1px; }

    .brand {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }

    .brand-link {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-decoration: none;
      opacity: 0.6;
      cursor: pointer;
    }

    .brand-link:hover { color: var(--vscode-textLink-foreground); opacity: 1; }

    /* ── Stats row ────────────────────────── */

    .stats-row {
      display: flex;
      gap: 6px;
    }

    .stat-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 9px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }

    .stat-chip.live {
      background: rgba(74, 222, 128, 0.1);
      color: #4ade80;
    }

    .stat-chip.total {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .stat-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: currentColor;
    }

    /* ── Server note ──────────────────────── */

    .server-note {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      padding: 8px 10px;
      border-radius: 7px;
      background: rgba(245, 158, 11, 0.06);
      border: 1px solid rgba(245, 158, 11, 0.15);
      font-size: 11px;
      line-height: 1.45;
      width: 100%;
    }

    .note-icon { flex-shrink: 0; font-size: 12px; line-height: 1.3; }
    .server-note strong { color: #f59e0b; }

    /* ── Server note inline (inside live cards) ── */

    .server-note-inline {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      padding: 8px 12px;
      background: rgba(245, 158, 11, 0.05);
      border-top: 1px solid var(--vscode-widget-border);
      font-size: 10px;
      line-height: 1.45;
      color: var(--vscode-descriptionForeground);
    }

    .server-note-inline strong { color: #f59e0b; }

    /* ── Project cards (collapsed/expanded) ── */

    .projects-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .project-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 8px;
      overflow: hidden;
      transition: border-color 0.2s, box-shadow 0.2s;
      animation: fadeIn 0.3s ease-out both;
    }

    .project-card:hover {
      border-color: var(--vscode-focusBorder);
    }

    .project-card.live { border-left: 3px solid #4ade80; }
    .project-card.failed { border-left: 3px solid #f87171; }
    .project-card.stopped { border-left: 3px solid #64748b; }

    /* Collapsed header */
    .card-collapsed {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .card-collapsed:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .card-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .indicator {
      width: 7px; height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .indicator.live {
      background: #4ade80;
      box-shadow: 0 0 6px rgba(74, 222, 128, 0.5);
      animation: pulse 2s ease-in-out infinite;
    }

    .indicator.failed { background: #f87171; }
    .indicator.stopped { background: #64748b; }

    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 4px rgba(74, 222, 128, 0.3); }
      50% { box-shadow: 0 0 8px rgba(74, 222, 128, 0.6); }
    }

    .card-info {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .card-name {
      font-size: 12.5px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-status {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 1px 6px;
      border-radius: 3px;
      flex-shrink: 0;
    }

    .card-status.live { background: rgba(74, 222, 128, 0.12); color: #4ade80; }
    .card-status.failed { background: rgba(248, 113, 113, 0.12); color: #f87171; }
    .card-status.stopped { background: rgba(100, 116, 139, 0.12); color: #94a3b8; }

    .chevron {
      color: var(--vscode-descriptionForeground);
      opacity: 0.4;
      transition: transform 0.2s;
      flex-shrink: 0;
    }

    .project-card.expanded .chevron {
      transform: rotate(180deg);
    }

    /* URL strip (always visible for live) */
    .url-strip {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border-top: 1px solid var(--vscode-widget-border);
    }

    .live-url {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 600;
      color: #f59e0b;
      text-decoration: none;
      padding: 3px 8px;
      border-radius: 5px;
      background: rgba(245, 158, 11, 0.06);
      border: 1px solid rgba(245, 158, 11, 0.12);
      transition: all 0.15s;
      min-width: 0;
      flex: 1;
    }

    .live-url:hover {
      background: rgba(245, 158, 11, 0.12);
      border-color: rgba(245, 158, 11, 0.25);
      color: #fbbf24;
    }

    .url-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .public-pill {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 2px 5px;
      border-radius: 3px;
      background: rgba(74, 222, 128, 0.1);
      color: #4ade80;
      flex-shrink: 0;
    }

    .qr-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px; height: 24px;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 4px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      transition: all 0.15s;
      flex-shrink: 0;
    }

    .qr-btn:hover {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
    }

    /* QR drawer */
    .qr-drawer {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 8px 12px 6px;
      border-top: 1px solid var(--vscode-widget-border);
      animation: fadeScale 0.2s ease-out;
    }

    .qr-drawer.open { display: flex; }

    @keyframes fadeScale {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }

    .qr-frame {
      background: #fff;
      border-radius: 6px;
      padding: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    }

    .qr-frame img {
      width: 90px; height: 90px;
      display: block;
      image-rendering: pixelated;
    }

    .qr-caption {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.5;
    }

    /* Expanded section */
    .card-expanded {
      display: none;
      flex-direction: column;
      gap: 0;
      border-top: 1px solid var(--vscode-widget-border);
      animation: slideDown 0.2s ease-out;
    }

    .project-card.expanded .card-expanded {
      display: flex;
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ── Metric tiles (System Status inspired) ── */

    .metrics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--vscode-widget-border);
    }

    .metric-tile {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: var(--vscode-editor-background);
    }

    .metric-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px; height: 24px;
      border-radius: 6px;
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
    }

    .metric-data {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .metric-val {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: -0.2px;
      font-variant-numeric: tabular-nums;
    }

    .metric-lbl {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.6;
    }

    /* ── Chips row ────────────────────────── */

    .chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 8px 12px;
    }

    .chip {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 2px 6px;
      border-radius: 3px;
    }

    .chip-framework { background: rgba(99, 102, 241, 0.12); color: #818cf8; }
    .chip-auto { background: rgba(168, 85, 247, 0.12); color: #c084fc; }
    .chip-local {
      background: var(--vscode-textCodeBlock-background);
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
      text-transform: none;
      letter-spacing: 0;
    }

    /* ── Action buttons ──────────────────── */

    .actions-bar {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-widget-border);
    }

    .act-btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 5px 6px;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 5px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      font-family: inherit;
      font-size: 10.5px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .act-btn:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
      color: var(--vscode-foreground);
    }

    .act-warn { color: #fb923c; border-color: rgba(251, 146, 60, 0.2); }
    .act-warn:hover { background: rgba(251, 146, 60, 0.08); color: #f97316; border-color: rgba(251, 146, 60, 0.35); }

    .act-danger { color: #f87171; border-color: rgba(248, 113, 113, 0.2); }
    .act-danger:hover { background: rgba(248, 113, 113, 0.08); color: #ef4444; border-color: rgba(248, 113, 113, 0.35); }

    /* ── Inline log viewer ────────────────── */

    .log-viewer {
      display: none;
      flex-direction: column;
      border-top: 1px solid var(--vscode-widget-border);
      animation: slideDown 0.2s ease-out;
    }

    .log-viewer.open { display: flex; }

    .log-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: var(--vscode-sideBar-background);
    }

    .log-title {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
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
      width: 20px; height: 20px;
      border: none;
      border-radius: 3px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      transition: all 0.15s;
    }

    .log-action-btn:hover {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
    }

    .log-output {
      font-family: var(--vscode-editor-font-family), 'Cascadia Code', 'Fira Code', monospace;
      font-size: 10px;
      line-height: 1.5;
      padding: 8px 12px;
      max-height: 200px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-textCodeBlock-background);
      border-radius: 0 0 7px 7px;
    }

    .log-placeholder {
      opacity: 0.4;
      font-style: italic;
    }

    .log-output::-webkit-scrollbar { width: 4px; }
    .log-output::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 4px;
    }

    /* ── Deploy history mini ──────────────── */

    .deploys-mini {
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      border-top: 1px solid var(--vscode-widget-border);
    }

    .section-lbl {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.5;
    }

    .ship-metric {
      font-size: 16px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.5px;
      color: var(--vscode-foreground);
    }

    /* ── Danger zone ─────────────────────── */

    .danger-zone {
      border-top: 1px solid var(--vscode-widget-border);
      padding: 6px 12px 8px;
    }

    .danger-toggle {
      font-size: 9.5px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      opacity: 0.35;
      cursor: pointer;
      list-style: none;
      padding: 2px 0;
      transition: opacity 0.15s;
    }

    .danger-toggle:hover { opacity: 0.6; }
    .danger-toggle::-webkit-details-marker { display: none; }
    .danger-toggle::before { content: "\\25B8  "; font-size: 7px; }
    details[open] > .danger-toggle::before { content: "\\25BE  "; }

    .danger-body {
      padding: 6px 0 2px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .danger-msg {
      font-size: 10px;
      color: #f87171;
      line-height: 1.4;
      opacity: 0.7;
    }

    /* ── Footer ───────────────────────────── */

    .bottom-links {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
    }

    .bottom-links a {
      font-size: 11px;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }

    .bottom-links a:hover { text-decoration: underline; }

    .footer-link {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 0 0;
    }

    .footer-link a {
      font-size: 10.5px;
      color: var(--vscode-descriptionForeground);
      text-decoration: none;
      opacity: 0.6;
      cursor: pointer;
    }

    .footer-link a:hover { color: var(--vscode-textLink-foreground); opacity: 1; }

    .sep { color: var(--vscode-descriptionForeground); opacity: 0.3; font-size: 10px; }

    .tagline {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      opacity: 0.45;
      font-weight: 500;
      letter-spacing: 0.2px;
    }

    /* ── Animations ──────────────────────── */

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .onboard-card { animation: fadeIn 0.3s ease-out; }
    .server-note { animation: fadeIn 0.35s ease-out 0.08s both; }

    /* ── Celebration overlay ──────────────── */

    .celebration-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      animation: celebFadeIn 0.3s ease-out;
    }

    @keyframes celebFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .confetti-canvas {
      position: fixed;
      inset: 0;
      z-index: 10000;
      pointer-events: none;
    }

    .celeb-card {
      position: relative;
      z-index: 10001;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border);
      border-radius: 16px;
      padding: 28px 22px 22px;
      max-width: 280px;
      width: 90%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
      animation: celebCardIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes celebCardIn {
      from { opacity: 0; transform: scale(0.8) translateY(20px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    .celeb-emoji {
      font-size: 44px;
      line-height: 1;
      animation: celebBounce 0.6s ease-out;
    }

    @keyframes celebBounce {
      0% { transform: scale(0); }
      50% { transform: scale(1.3); }
      70% { transform: scale(0.9); }
      100% { transform: scale(1); }
    }

    .celeb-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #4ade80, #22d3ee);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .celeb-subtitle {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      line-height: 1.5;
    }

    .celeb-project {
      font-weight: 700;
      color: var(--vscode-foreground);
    }

    .celeb-url-card {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 14px;
      background: rgba(245, 158, 11, 0.05);
      border: 1px solid rgba(245, 158, 11, 0.15);
      border-radius: 10px;
      margin-top: 4px;
    }

    .celeb-url {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12.5px;
      font-weight: 700;
      color: #f59e0b;
      text-decoration: none;
      word-break: break-all;
      text-align: center;
      cursor: pointer;
      transition: color 0.15s;
    }

    .celeb-url:hover { color: #fbbf24; }

    .celeb-qr {
      background: #fff;
      border-radius: 8px;
      padding: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }

    .celeb-qr img {
      width: 110px;
      height: 110px;
      display: block;
      image-rendering: pixelated;
    }

    .celeb-qr-label {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.5;
    }

    .celeb-yay {
      width: 100%;
      padding: 12px 14px;
      border: none;
      border-radius: 10px;
      background: linear-gradient(135deg, #4ade80, #22d3ee);
      color: #000;
      font-family: inherit;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.15s;
      letter-spacing: -0.2px;
      margin-top: 4px;
    }

    .celeb-yay:hover { filter: brightness(1.1); transform: scale(1.02); }
    .celeb-yay:active { transform: scale(0.98); }

    .celeb-server-note {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      line-height: 1.45;
      opacity: 0.7;
    }

    .celeb-server-note strong { color: #f59e0b; }
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

    function toggleCard(card) {
      card.classList.toggle('expanded');
    }

    function toggleLogs(project) {
      const viewer = document.getElementById('logs-' + project);
      if (!viewer) return;
      if (viewer.classList.contains('open')) {
        // Already open — close it
        viewer.classList.remove('open');
      } else {
        // Closed — fetch and open
        post('viewLogs', { project: project });
      }
    }

    function copyLogs(project) {
      const viewer = document.getElementById('logs-' + project);
      if (!viewer) return;
      const output = viewer.querySelector('.log-output');
      if (!output) return;
      const text = output.textContent || '';
      post('copyLogs', { text: text });
    }

    // ── Confetti engine ──────────────────────────
    function launchConfetti() {
      const canvas = document.createElement('canvas');
      canvas.className = 'confetti-canvas';
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const colors = ['#4ade80','#22d3ee','#f59e0b','#a78bfa','#f472b6','#fb923c','#34d399','#60a5fa'];
      const particles = [];
      for (let i = 0; i < 120; i++) {
        particles.push({
          x: canvas.width / 2 + (Math.random() - 0.5) * 60,
          y: canvas.height / 2,
          vx: (Math.random() - 0.5) * 14,
          vy: -(Math.random() * 12 + 4),
          w: Math.random() * 6 + 3,
          h: Math.random() * 4 + 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          rot: Math.random() * 360,
          rotV: (Math.random() - 0.5) * 12,
          gravity: 0.18 + Math.random() * 0.08,
          opacity: 1,
          decay: 0.008 + Math.random() * 0.006,
        });
      }

      let frame = 0;
      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = 0;
        for (const p of particles) {
          if (p.opacity <= 0) continue;
          alive++;
          p.x += p.vx;
          p.vy += p.gravity;
          p.y += p.vy;
          p.vx *= 0.99;
          p.rot += p.rotV;
          if (frame > 40) p.opacity -= p.decay;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * Math.PI / 180);
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
          ctx.restore();
        }
        frame++;
        if (alive > 0 && frame < 200) {
          requestAnimationFrame(draw);
        } else {
          canvas.remove();
        }
      }
      requestAnimationFrame(draw);
    }

    // ── Show celebration popup ────────────────────
    function showCelebration(project, url) {
      // Remove existing celebration if any
      const existing = document.getElementById('celebration');
      if (existing) existing.remove();

      const displayUrl = url.replace('https://', '');
      const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&bgcolor=ffffff&color=000000&data=' + encodeURIComponent(url);

      const overlay = document.createElement('div');
      overlay.id = 'celebration';
      overlay.className = 'celebration-overlay';
      overlay.innerHTML = \`
        <div class="celeb-card">
          <div class="celeb-emoji">\\u{1F389}</div>
          <div class="celeb-title">You shipped it!</div>
          <div class="celeb-subtitle"><span class="celeb-project">\${project}</span> is live. The internet can see it. You did that.</div>

          <div class="celeb-url-card">
            <a class="celeb-url" href="#" onclick="event.stopPropagation(); post('openUrl', '\${url}')">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1.002 1.002 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4.018 4.018 0 0 1-.128-1.287z"/><path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243L6.586 4.672z"/></svg>
              \${displayUrl}
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" opacity="0.4"><path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/><path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z"/></svg>
            </a>

            <div class="celeb-qr">
              <img src="\${qrUrl}" alt="QR Code" onerror="this.closest('.celeb-qr').style.display='none'" />
            </div>
            <span class="celeb-qr-label">Show your mom. She'll be proud.</span>
          </div>

          <div class="celeb-server-note">
            \\u26A1 <strong>Your machine is the server.</strong><br>Shut it down and your site naps too. VS Code can close though &mdash; we handle the rest.
          </div>

          <button class="celeb-yay" onclick="document.getElementById('celebration').remove()">
            \\u{1F389} Back to building
          </button>
        </div>
      \`;

      document.body.appendChild(overlay);

      // Launch confetti
      launchConfetti();
      // Second burst slightly delayed
      setTimeout(launchConfetti, 300);
    }

    // Listen for messages from extension
    window.addEventListener('message', (event) => {
      const msg = event.data;

      // Log data for inline viewer
      if (msg.command === 'logsData' && msg.project) {
        const viewer = document.getElementById('logs-' + msg.project);
        if (viewer) {
          viewer.classList.add('open');
          const output = viewer.querySelector('.log-output');
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

      // Deploy celebration!
      if (msg.command === 'celebrate' && msg.url) {
        showCelebration(msg.project || 'Your project', msg.url);
      }
    });
  </script>
</body>
</html>`;
  }
}
