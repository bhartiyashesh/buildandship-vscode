/**
 * Welcome Webview — shown when the user isn't logged in.
 * Beautiful onboarding panel with sign-in button and install guide.
 */

import * as vscode from "vscode";

export class WelcomeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "buildandship.welcome";

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "login":
          vscode.commands.executeCommand("buildandship.login");
          break;
        case "install":
          vscode.env.openExternal(vscode.Uri.parse("https://buildandship.it/docs#install"));
          break;
        case "docs":
          vscode.env.openExternal(vscode.Uri.parse("https://buildandship.it/docs"));
          break;
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
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
      padding: 20px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .logo {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
      text-align: center;
      margin-bottom: 4px;
    }

    .logo span { color: var(--vscode-textLink-foreground); }

    .tagline {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      line-height: 1.5;
      max-width: 260px;
    }

    .divider {
      width: 40px;
      height: 1px;
      background: var(--vscode-widget-border);
      margin: 4px 0;
    }

    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      max-width: 260px;
      padding: 10px 16px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .btn:hover { opacity: 0.85; }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .steps {
      width: 100%;
      max-width: 260px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 4px;
    }

    .step {
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }

    .step-num {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .step-text {
      font-size: 12px;
      line-height: 1.5;
      color: var(--vscode-descriptionForeground);
    }

    .step-text code {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      background: var(--vscode-textCodeBlock-background);
      padding: 1px 5px;
      border-radius: 3px;
    }

    .footer {
      margin-top: 8px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
    }

    .footer a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="logo">Build <span>&</span> Ship</div>
  <p class="tagline">
    You vibe it. We ship it.<br>
    Deploy from your editor. Zero DevOps.
  </p>

  <div class="divider"></div>

  <button class="btn btn-primary" onclick="post('login')">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
    Sign in with GitHub
  </button>

  <button class="btn btn-secondary" onclick="post('install')">
    Install CLI
  </button>

  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-text">Install the CLI<br><code>curl -fsSL https://buildandship.it/install | sh</code></div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-text">Sign in with GitHub<br><code>bs login</code></div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-text">Deploy your project<br><code>bs deploy</code></div>
    </div>
  </div>

  <div class="footer">
    <a onclick="post('docs')">Documentation</a> · <a href="https://buildandship.it">buildandship.it</a>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function post(command) { vscode.postMessage({ command }); }
  </script>
</body>
</html>`;
  }
}
