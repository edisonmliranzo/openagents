@echo off
title OpenAgents Desktop
echo Starting OpenAgents Windows Desktop Application...
cd /d "%~dp0"
pnpm run desktop:dev
