#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/edisonmliranzo/openagents.git"
INSTALL_DIR="${HOME}/openagents"
RUN_DEV=0
SKIP_DOCKER=0
SKIP_MIGRATE=0

usage() {
  cat <<'EOF'
OpenAgents macOS / Ubuntu installer

Usage:
  bash scripts/install.sh [options]

Options:
  --dir <path>       Target clone directory. Default: ~/openagents
  --run-dev          Start `pnpm dev` after setup completes
  --skip-docker      Skip Docker startup and run the lighter setup path
  --skip-migrate     Skip Prisma migrate during setup
  --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --run-dev)
      RUN_DEV=1
      shift
      ;;
    --skip-docker)
      SKIP_DOCKER=1
      shift
      ;;
    --skip-migrate)
      SKIP_MIGRATE=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

log_step() {
  printf '\n== %s ==\n' "$1"
}

run() {
  printf '> '
  printf '%q ' "$@"
  printf '\n'
  "$@"
}

has() {
  command -v "$1" >/dev/null 2>&1
}

sudo_run() {
  if [[ "${EUID}" -eq 0 ]]; then
    run "$@"
  else
    if ! has sudo; then
      echo "sudo is required to continue." >&2
      exit 1
    fi
    run sudo "$@"
  fi
}

node_major() {
  if ! has node; then
    echo 0
    return
  fi
  node -p "Number(process.versions.node.split('.')[0])"
}

ensure_corepack_pnpm() {
  if ! has corepack; then
    echo "corepack is unavailable. Install Node.js 20+ and rerun the installer." >&2
    exit 1
  fi

  run corepack enable
  run corepack prepare pnpm@9.0.0 --activate
  hash -r

  if ! has pnpm; then
    echo "pnpm 9 could not be activated. Open a new shell and rerun the installer." >&2
    exit 1
  fi
}

ensure_homebrew() {
  if ! has brew; then
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi

  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

ensure_macos_prereqs() {
  log_step "macOS prerequisites"
  ensure_homebrew
  run brew install git node
  run brew install --cask docker
  ensure_corepack_pnpm
}

ensure_ubuntu_prereqs() {
  log_step "Ubuntu prerequisites"
  sudo_run apt-get update
  sudo_run apt-get install -y git curl ca-certificates gnupg

  if [[ "$(node_major)" -lt 20 ]]; then
    if [[ "${EUID}" -eq 0 ]]; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    else
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    fi
  fi

  sudo_run apt-get install -y nodejs docker.io docker-compose-plugin
  sudo_run systemctl enable --now docker

  if [[ "${EUID}" -ne 0 ]] && ! id -nG "${USER}" | grep -qw docker; then
    sudo_run usermod -aG docker "${USER}" || true
  fi

  ensure_corepack_pnpm
}

start_docker_macos() {
  if [[ -d /Applications/Docker.app ]]; then
    open -a Docker
    return
  fi

  if [[ -d "${HOME}/Applications/Docker.app" ]]; then
    open "${HOME}/Applications/Docker.app"
  fi
}

wait_for_docker() {
  local timeout_seconds="${1:-240}"
  local elapsed=0
  while (( elapsed < timeout_seconds )); do
    if docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

clone_or_update_repo() {
  log_step "Repository"
  mkdir -p "$(dirname "${INSTALL_DIR}")"

  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    run git -C "${INSTALL_DIR}" fetch origin --prune
    run git -C "${INSTALL_DIR}" pull --ff-only origin main
    return
  fi

  if [[ -e "${INSTALL_DIR}" ]]; then
    echo "Install directory '${INSTALL_DIR}' already exists but is not a git checkout." >&2
    exit 1
  fi

  run git clone "${REPO_URL}" "${INSTALL_DIR}"
}

run_setup_script() {
  local script_name="setup"
  if (( SKIP_DOCKER )); then
    script_name="setup:skip-docker"
  elif (( SKIP_MIGRATE )); then
    script_name="setup:skip-migrate"
  fi

  (cd "${INSTALL_DIR}" && run pnpm "${script_name}")
}

run_setup_with_sudo_docker() {
  (cd "${INSTALL_DIR}" && run pnpm setup:skip-docker)
  if (( ! SKIP_DOCKER )); then
    (cd "${INSTALL_DIR}" && sudo_run docker compose -f infra/docker/docker-compose.yml up -d)
  fi
  if (( ! SKIP_MIGRATE )); then
    (cd "${INSTALL_DIR}" && run pnpm --filter @openagents/api run db:migrate)
  fi
}

os_name="$(uname -s)"
case "${os_name}" in
  Darwin)
    ensure_macos_prereqs
    clone_or_update_repo

    if (( ! SKIP_DOCKER )); then
      log_step "Docker Desktop"
      start_docker_macos
      if ! wait_for_docker 300; then
        echo "Docker Desktop did not become ready in time. Start Docker and rerun, or use --skip-docker." >&2
        exit 1
      fi
    fi

    log_step "OpenAgents setup"
    run_setup_script
    ;;
  Linux)
    ensure_ubuntu_prereqs
    clone_or_update_repo

    log_step "OpenAgents setup"
    if (( SKIP_DOCKER )); then
      run_setup_script
    elif docker info >/dev/null 2>&1; then
      run_setup_script
    elif sudo docker info >/dev/null 2>&1; then
      printf 'Docker is available through sudo for this first run. Future runs should work directly after a new login shell.\n'
      run_setup_with_sudo_docker
    else
      echo "Docker is not ready. Start Docker and rerun, or use --skip-docker." >&2
      exit 1
    fi
    ;;
  *)
    echo "Unsupported OS: ${os_name}. This installer supports macOS and Ubuntu." >&2
    exit 1
    ;;
esac

printf '\nOpenAgents is installed.\n'
printf 'Repo: %s\n' "${INSTALL_DIR}"
printf 'Start it with:\n'
printf '  cd %q && pnpm dev\n' "${INSTALL_DIR}"
printf 'Then open http://localhost:3000/login\n'

if (( RUN_DEV )); then
  log_step "Start development server"
  cd "${INSTALL_DIR}"
  run pnpm dev
fi
