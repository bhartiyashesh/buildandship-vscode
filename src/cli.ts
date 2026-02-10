/**
 * CLI bridge — talks to the `bs` binary and returns typed data.
 * All extension data flows through here. No SQLite dependency,
 * no fragile text parsing. Just clean JSON from `bs --json`.
 */

import { execFile } from "child_process";
import { workspace } from "vscode";

// ── Types matching bs CLI --json output ─────────────────────────────

export interface ListProject {
  name: string;
  status: string;
  public_url?: string;
  tunnel_active: boolean;
  auto_deploy?: {
    repo: string;
    branch: string;
  };
}

export interface StatusAll {
  projects: StatusProject[];
}

export interface StatusProject {
  name: string;
  framework?: string;
  status: string;
  url?: string;
  local_url?: string;
  cpu?: string;
  memory?: string;
  uptime?: string;
}

export interface StatusDetail {
  name: string;
  directory: string;
  framework?: string;
  status: string;
  container_id?: string;
  container_name?: string;
  uptime?: string;
  local_url?: string;
  public_url?: string;
  tunnel_active: boolean;
  resources?: {
    cpu: string;
    memory: string;
    net?: string;
  };
  deploys?: Deploy[];
  custom_domains?: string[];
}

export interface Deploy {
  id: string;
  status: string;
  commit_sha?: string;
  branch?: string;
  duration_ms?: number;
  error?: string;
  created_at: string;
}

export interface WhoAmI {
  name: string;
  email: string;
  provider: string;
  user_id: string;
  logged_in: string;
  expires: string;
}

// ── CLI runner ──────────────────────────────────────────────────────

function getCliPath(): string {
  return workspace.getConfiguration("buildandship").get<string>("cliPath", "bs");
}

function exec(args: string[], timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const cli = getCliPath();
    const proc = execFile(cli, args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1MB
      env: { ...process.env, NO_COLOR: "1" },
    }, (error, stdout, stderr) => {
      if (error) {
        // Include stderr in error message for debugging
        const msg = stderr?.trim() || error.message;
        reject(new Error(`bs ${args.join(" ")}: ${msg}`));
        return;
      }
      resolve(stdout);
    });
  });
}

/** Like exec() but returns stdout + stderr combined.
 *  Needed for commands like `bs whoami` where the CLI log package
 *  writes user-visible output to stderr rather than stdout. */
function execAll(args: string[], timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const cli = getCliPath();
    const proc = execFile(cli, args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, NO_COLOR: "1" },
    }, (error, stdout, stderr) => {
      if (error) {
        const msg = stderr?.trim() || error.message;
        reject(new Error(`bs ${args.join(" ")}: ${msg}`));
        return;
      }
      resolve((stdout || "") + (stderr || ""));
    });
  });
}

function execJSON<T>(args: string[]): Promise<T> {
  return exec([...args, "--json"]).then((out) => {
    try {
      return JSON.parse(out) as T;
    } catch {
      throw new Error(`Failed to parse JSON from: bs ${args.join(" ")} --json`);
    }
  });
}

// ── Public API ──────────────────────────────────────────────────────

/** List all projects (bs list --json) */
export function listProjects(): Promise<ListProject[]> {
  return execJSON<ListProject[]>(["list"]);
}

/** Status of all projects (bs status --json) */
export function statusAll(): Promise<StatusAll> {
  return execJSON<StatusAll>(["status"]);
}

/** Detailed status for one project (bs status <name> --json) */
export function statusDetail(project: string): Promise<StatusDetail> {
  return execJSON<StatusDetail>(["status", project]);
}

/** Check if user is logged in by running bs whoami.
 *  NOTE: `bs whoami` writes all output to stderr via the log package,
 *  so we must use execAll() to capture both stdout + stderr. */
export async function isLoggedIn(): Promise<boolean> {
  try {
    const out = await execAll(["whoami"]);
    // Not logged in → output contains "Not logged in"
    if (out.includes("Not logged in")) {
      return false;
    }
    // Logged in → output contains user info fields
    return out.includes("Email") || out.includes("Name") || out.includes("User ID");
  } catch {
    return false;
  }
}

/** Check if bs CLI is installed */
export async function isCliInstalled(): Promise<boolean> {
  try {
    await exec(["version"], 5000);
    return true;
  } catch {
    return false;
  }
}

/** Get CLI version string */
export async function getVersion(): Promise<string> {
  const out = await exec(["version"], 5000);
  // Output is like "Build & Ship v0.7.0 (darwin/arm64)"
  const match = out.match(/v[\d.]+/);
  return match ? match[0] : "unknown";
}

/** Fetch recent logs for a project (bs logs <name> --tail 100) */
export async function getLogs(project: string, lines = 100): Promise<string> {
  try {
    const out = await exec(["logs", project, "--tail", String(lines)], 10000);
    return out;
  } catch (err: any) {
    return err.message || "Failed to fetch logs";
  }
}
