#!/usr/bin/env node

import { spawnSync } from "node:child_process";
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

function requireNode20() {
  const major = Number(process.versions.node.split(".")[0] || "0");
  if (!Number.isFinite(major) || major < 20) {
    throw new Error(
      `Node.js 20+ is required. Detected ${process.version}. Install Node 20 LTS and rerun setup.`,
    );
  }
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
  console.log("For production-like Docker stack, run \"pnpm prod:up\".");
} catch (error) {
  console.error("\nSetup failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
