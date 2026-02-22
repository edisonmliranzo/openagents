#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const defaults = {
  envFile: "infra/docker/.env.prod",
  composeFile: "infra/docker/docker-compose.prod.yml",
  service: "api",
  baseUrl: "",
  allowEmpty: false,
};

const args = process.argv.slice(2);
const showHelp = args.includes("--help") || args.includes("-h");
const config = { ...defaults };

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = args[i + 1];

  if (arg === "--help" || arg === "-h") continue;
  if (arg === "--allow-empty") {
    config.allowEmpty = true;
    continue;
  }
  if (arg === "--env-file" && next) {
    config.envFile = next;
    i += 1;
    continue;
  }
  if (arg === "--compose-file" && next) {
    config.composeFile = next;
    i += 1;
    continue;
  }
  if (arg === "--service" && next) {
    config.service = next;
    i += 1;
    continue;
  }
  if (arg === "--url" && next) {
    config.baseUrl = next;
    i += 1;
    continue;
  }
}

if (showHelp) {
  console.log(`Check Ollama reachability from Docker API service.

Usage:
  node scripts/check-ollama-health.mjs [options]

Options:
  --env-file <path>      Env file for docker compose (default: ${defaults.envFile})
  --compose-file <path>  Docker compose file (default: ${defaults.composeFile})
  --service <name>       Service to exec into (default: ${defaults.service})
  --url <baseUrl>        Override Ollama base URL (default: OLLAMA_BASE_URL from env file)
  --allow-empty          Do not fail when model list is empty
  -h, --help             Show this help
`);
  process.exit(0);
}

function commandCandidates(command) {
  if (process.platform !== "win32") {
    return [command];
  }
  return [command, `${command}.cmd`, `${command}.exe`];
}

function runCapture(command, commandArgs, options = {}) {
  const printable = `${command} ${commandArgs.join(" ")}`.trim();
  let result;

  for (const candidate of commandCandidates(command)) {
    result = spawnSync(candidate, commandArgs, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error && result.error.code === "ENOENT") {
      continue;
    }
    break;
  }

  if (!result) {
    throw new Error(`Command not found: ${command}`);
  }
  if (result.error) {
    throw new Error(`Failed to run "${printable}": ${result.error.message}`);
  }
  if (result.status !== 0 && !options.allowFailure) {
    const details = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n");
    throw new Error(`Command failed (${result.status}): ${printable}${details ? `\n${details}` : ""}`);
  }

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const out = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;

    const key = line.slice(0, idx).trim();
    if (!key) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }

  return out;
}

function normalizeBaseUrl(raw) {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  const candidate = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Invalid Ollama URL: ${trimmed}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Ollama URL must use http/https: ${trimmed}`);
  }

  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.origin;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function composeArgs(envFile, composeFile, service, command) {
  return [
    "compose",
    "--env-file",
    envFile,
    "-f",
    composeFile,
    "exec",
    "-T",
    service,
    "sh",
    "-lc",
    command,
  ];
}

function heading(value) {
  console.log(`\n== ${value} ==`);
}

try {
  const envFilePath = path.join(rootDir, config.envFile);
  const composeFilePath = path.join(rootDir, config.composeFile);

  if (!fs.existsSync(composeFilePath)) {
    throw new Error(`Compose file not found: ${config.composeFile}`);
  }
  if (!fs.existsSync(envFilePath)) {
    throw new Error(`Env file not found: ${config.envFile}`);
  }

  const envVars = parseEnvFile(envFilePath);
  const baseUrl = normalizeBaseUrl(config.baseUrl || envVars.OLLAMA_BASE_URL || "http://localhost:11434");
  const tagsUrl = new URL("/api/tags", `${baseUrl}/`).toString();

  heading("Config");
  console.log(`- compose: ${config.composeFile}`);
  console.log(`- env file: ${config.envFile}`);
  console.log(`- service: ${config.service}`);
  console.log(`- ollama tags URL: ${tagsUrl}`);

  heading("Docker");
  runCapture("docker", ["compose", "version"]);
  runCapture("docker", composeArgs(config.envFile, config.composeFile, config.service, "echo api-ok"));
  console.log("- API service is reachable via docker compose exec");

  heading("API Service Env");
  const envCheck = runCapture(
    "docker",
    composeArgs(config.envFile, config.composeFile, config.service, "printenv OLLAMA_BASE_URL || true"),
  );
  const activeBase = envCheck.stdout.trim();
  if (activeBase) {
    console.log(`- OLLAMA_BASE_URL inside service: ${activeBase}`);
  } else {
    console.log("- OLLAMA_BASE_URL inside service: (not set)");
  }

  heading("Ollama Reachability");
  const curlResult = runCapture(
    "docker",
    composeArgs(config.envFile, config.composeFile, config.service, `curl -fsS ${shellQuote(tagsUrl)}`),
  );

  let modelCount = 0;
  let modelNames = [];
  try {
    const parsed = JSON.parse(curlResult.stdout);
    const models = Array.isArray(parsed?.models) ? parsed.models : [];
    modelNames = models
      .map((entry) => {
        if (entry && typeof entry === "object") {
          const name = typeof entry.name === "string" ? entry.name : "";
          const model = typeof entry.model === "string" ? entry.model : "";
          return (name || model).trim();
        }
        return "";
      })
      .filter(Boolean);
    modelCount = modelNames.length;
  } catch {
    throw new Error("Ollama /api/tags returned non-JSON output.");
  }

  if (modelCount < 1 && !config.allowEmpty) {
    throw new Error('Ollama endpoint reachable, but no models found. Run "ollama pull <model>" on the host.');
  }

  console.log(`- Models detected: ${modelCount}`);
  if (modelNames.length > 0) {
    const sample = modelNames.slice(0, 5).join(", ");
    console.log(`- Sample: ${sample}${modelNames.length > 5 ? ", ..." : ""}`);
  }
  if (modelCount < 1 && config.allowEmpty) {
    console.log("- Empty model list allowed (--allow-empty)");
  }

  console.log("\nOllama health check passed.");
} catch (error) {
  console.error("\nOllama health check failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

