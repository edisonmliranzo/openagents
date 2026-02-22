# OpenAgents Browser Capture Extension (MVP)

## What it does

- Adds a right-click action: `Send selection to OpenAgents`
- Sends selected text to `POST /api/v1/memory/capture`
- Optionally also appends the capture into a target conversation as a user message

## Setup

1. Open Chrome/Edge extension management page.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder: `extensions/browser-capture`.
4. Open extension options and set:
   - `API Base URL` (default `http://localhost:3001`)
   - `Bearer Token` (your OpenAgents JWT)
   - Optional `Conversation ID`

## Usage

1. Highlight text on any web page.
2. Right click.
3. Click `Send selection to OpenAgents`.

The capture lands in memory with `browser-capture` tags.

## Notes

- Host permissions are scoped to local API URLs by default.
- If you run API on a different host/port, update `manifest.json` host permissions.
