#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const args = new Set(process.argv.slice(2));
const showHelp = args.has("--help") || args.has("-h");
let skipDocker = args.has("--skip-docker");
let skipMigrate = args.has("--skip-migrate");

if (showHelp) {
  console.log(`OpenAgents setup

Usage:
  node scripts/setup.mjs [options]

Options:
  --skip-docker    Skip "docker compose up" for local Postgres/Redis
  --skip-migrate   Skip Prisma migrate step
  -h, --help       Show help
`);
  process.exit(0);
}

function heading(title) {
  console.log(`\n== ${title} ==`);
}

function commandCandidates(command) {
  if (process.platform !== "win32") {
    return [command];
  }
  return [command, `${command}.cmd`, `${command}.exe`];
}

function run(command, commandArgs, options = {}) {
  const printable = `${command} ${commandArgs.join(" ")}`.trim();
  console.log(`> ${printable}`);

  let result;
  for (const candidate of commandCandidates(command)) {
    result = spawnSync(candidate, commandArgs, {
      cwd: rootDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.error && result.error.code === "ENOENT") {
      continue;
    }
    break;
  }

  if (!result) {
    if (options.allowFailure) {
      return false;
    }
    throw new Error(`Failed to run "${printable}": command not found`);
  }

  if (result.error) {
    if (options.allowFailure) {
      return false;
    }
    throw new Error(`Failed to run "${printable}": ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (options.allowFailure) {
      return false;
    }
    throw new Error(`Command failed with exit code ${result.status}: ${printable}`);
  }

  return true;
}

function canRun(command, commandArgs) {
  for (const candidate of commandCandidates(command)) {
    const result = spawnSync(candidate, commandArgs, {
      cwd: rootDir,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    if (result.error && result.error.code === "ENOENT") {
      continue;
    }
    return !result.error && result.status === 0;
  }
  return false;
}

function ensureFile(targetRel, templateRel) {
  const targetPath = path.join(rootDir, targetRel);
  const templatePath = path.join(rootDir, templateRel);
  if (fs.existsSync(targetPath)) {
    console.log(`- Keeping existing ${targetRel}`);
    return;
  }
  fs.copyFileSync(templatePath, targetPath);
  console.log(`- Created ${targetRel} from ${templateRel}`);
}

function readEnvLine(raw, key) {
  const match = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : null;
}

function isPlaceholderValue(value, markers) {
  if (value == null) return false;
  const unquoted = value.replace(/^"|"$/g, "");
  if (!unquoted) return true;
  return markers.some((marker) => unquoted.includes(marker));
}

// Replaces placeholder secrets with random values. Only touches lines that
// still contain known placeholder markers, so re-running setup never
// overwrites real secrets. Works on Windows/macOS/Linux (no shell needed).
function seedSecrets(targetRel, specs) {
  const targetPath = path.join(rootDir, targetRel);
  if (!fs.existsSync(targetPath)) return;
  let raw = fs.readFileSync(targetPath, "utf8");
  let changed = false;

  for (const spec of specs) {
    const current = readEnvLine(raw, spec.key);
    if (!isPlaceholderValue(current, spec.markers)) continue;
    raw = raw.replace(new RegExp(`^${spec.key}=.*$`, "m"), `${spec.key}=${spec.value()}`);
    changed = true;
    console.log(`- Generated ${spec.key} in ${targetRel}`);
  }

  if (changed) fs.writeFileSync(targetPath, raw);
}

// Worker/webhook tokens. The endpoints fail closed when these are unset, so
// setup must create them or the internal workers and channel webhooks reject
// every request.
const WORKER_TOKEN_KEYS = [
  "APPROVAL_WORKER_TOKEN",
  "CI_HEALER_TOKEN",
  "CI_HEALER_WORKER_TOKEN",
  "EXTRACTION_WORKER_TOKEN",
  "TOOL_RUN_WORKER_TOKEN",
  "WORKFLOW_WORKER_TOKEN",
  "WHATSAPP_WEBHOOK_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
];

function ensureMissingKeys(targetRel, keys) {
  const targetPath = path.join(rootDir, targetRel);
  if (!fs.existsSync(targetPath)) return;
  let raw = fs.readFileSync(targetPath, "utf8");
  const added = [];
  for (const key of keys) {
    if (new RegExp(`^${key}=`, "m").test(raw)) continue;
    raw = `${raw.replace(/\s*$/, "")}\n${key}="${crypto.randomBytes(32).toString("hex")}"\n`;
    added.push(key);
  }
  if (added.length) {
    fs.writeFileSync(targetPath, raw);
    console.log(`- Generated ${added.join(", ")} in ${targetRel}`);
  }
}

function seedApiSecrets() {
  seedSecrets("apps/api/.env", [
    { key: "JWT_SECRET", markers: ["change-me"], value: () => `"${crypto.randomBytes(48).toString("hex")}"` },
    { key: "JWT_REFRESH_SECRET", markers: ["change-me"], value: () => `"${crypto.randomBytes(48).toString("hex")}"` },
    { key: "ENCRYPTION_KEY", markers: ["32-char-hex-key-here", "change-me"], value: () => `"${crypto.randomBytes(32).toString("hex")}"` },
  ]);
  ensureMissingKeys("apps/api/.env", WORKER_TOKEN_KEYS);
}

function seedProdSecrets() {
  const targetPath = path.join(rootDir, "infra/docker/.env.prod");
  if (!fs.existsSync(targetPath)) return;
  seedSecrets("infra/docker/.env.prod", [
    { key: "JWT_SECRET", markers: ["replace-with", "change-me"], value: () => crypto.randomBytes(48).toString("hex") },
    { key: "JWT_REFRESH_SECRET", markers: ["replace-with", "change-me"], value: () => crypto.randomBytes(48).toString("hex") },
    { key: "ENCRYPTION_KEY", markers: ["32-char-hex-key-here", "change-me"], value: () => crypto.randomBytes(32).toString("hex") },
  ]);
  // Keep POSTGRES_PASSWORD and DATABASE_URL in sync (prod compose defaults
  // to change-me when the variables are absent).
  let raw = fs.readFileSync(targetPath, "utf8");
  const pw = readEnvLine(raw, "POSTGRES_PASSWORD");
  if (isPlaceholderValue(pw, ["change-me"])) {
    const fresh = crypto.randomBytes(24).toString("hex");
    raw = raw.replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${fresh}`);
    raw = raw.replace(/^(DATABASE_URL=.*postgres:)([^@]*)(@.*)$/m, `$1${fresh}$3`);
    fs.writeFileSync(targetPath, raw);
    console.log("- Generated POSTGRES_PASSWORD in infra/docker/.env.prod");
  }
}

function requireNode20() {
  const major = Number(process.versions.node.split(".")[0] || "0");
  if (!Number.isFinite(major) || major < 20) {
    throw new Error(
      `Node.js 20+ is required. Detected ${process.version}. Install Node 20 LTS and rerun setup.`,
    );
  }
}

function localAccessExample() {
  if (process.platform === "win32") {
    return "http://localhost:3000/login";
  }
  if (process.platform === "darwin") {
    return "http://localhost:3000/login";
  }
  return "http://<your-ubuntu-ip>:3000/login";
}

try {
  heading("Validate runtime");
  requireNode20();
  console.log(`- Node ${process.version}`);

  heading("pnpm");
  if (!canRun("pnpm", ["--version"])) {
    if (canRun("corepack", ["--version"])) {
      run("corepack", ["enable"]);
      run("corepack", ["prepare", "pnpm@9.0.0", "--activate"]);
    } else if (canRun("npm", ["--version"])) {
      run("npm", ["install", "--global", "pnpm@9"]);
    } else {
      throw new Error("pnpm is not available and neither corepack nor npm could be found.");
    }
  }
  if (!canRun("pnpm", ["--version"])) {
    throw new Error("Unable to activate pnpm 9. Install pnpm manually and rerun setup.");
  }
  run("pnpm", ["--version"]);

  heading("Install dependencies");
  run("pnpm", ["install"]);

  heading("Environment files");
  ensureFile("apps/api/.env", "apps/api/.env.example");
  ensureFile("apps/web/.env.local", "apps/web/.env.example");
  ensureFile("infra/docker/.env.prod", "infra/docker/.env.prod.example");
  seedApiSecrets();
  seedProdSecrets();

  heading("Local infrastructure");
  if (skipDocker) {
    console.log("- Skipping Docker startup (--skip-docker)");
    skipMigrate = true;
  } else if (!canRun("docker", ["compose", "version"])) {
    console.log("- Docker Compose not found; skipping container startup");
    skipMigrate = true;
  } else {
    run("docker", ["compose", "-f", "infra/docker/docker-compose.yml", "up", "-d"]);
  }

  heading("Prisma");
  run("pnpm", ["--filter", "@openagents/api", "run", "db:generate"]);
  if (skipMigrate) {
    console.log("- Skipping migrations (no local DB was started)");
  } else {
    run("pnpm", ["--filter", "@openagents/api", "run", "db:migrate"]);
  }

  console.log("\nSetup complete.");
  console.log("Run \"pnpm dev\" to start the apps.");
  console.log(`Access example after startup: ${localAccessExample()}`);
  console.log("For production-like Docker stack, run \"pnpm prod:up\".");
} catch (error) {
  console.error("\nSetup failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
