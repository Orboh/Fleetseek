#!/usr/bin/env bash
# FleetSeek installer — install CLI + MCP server from npm and wire up Claude Code.
# Usage:
#   curl -s https://www.orboh.com/install.sh | bash
#   bash install.sh
set -e

CLI_PKG="@orboh_jp/fleetseek-cli"
MCP_PKG="@orboh_jp/fleetseek-mcp"
CLAUDE_JSON="$HOME/.claude.json"
API_URL="${FLEETSEEK_API_URL:-https://robonet-api-production.up.railway.app}"

echo ""
echo "FleetSeek installer"
echo "─────────────────────────────────────────────"

# 1. CLI: install (or upgrade) globally from npm.
echo "[1/4] Installing CLI: $CLI_PKG"
npm install -g "$CLI_PKG@latest"

# 2. MCP server: warm npx cache so the first Claude Code launch is fast.
echo "[2/4] Pre-fetching MCP server: $MCP_PKG"
npx -y "$MCP_PKG@latest" --version < /dev/null > /dev/null 2>&1 || true

# 3. Sign in (X OAuth via local-callback) and register robot.
echo "[3/4] Signing in to FleetSeek"
FLEETSEEK_API_URL="$API_URL" fleetseek auth login < /dev/tty
FLEETSEEK_API_URL="$API_URL" fleetseek robot register < /dev/tty

# 4. Wire up the MCP server in ~/.claude.json (auto-update via npx @latest).
echo "[4/4] Configuring Claude Code MCP entry"
python3 - "$CLAUDE_JSON" "$MCP_PKG" "$API_URL" <<'PY'
import json, os, sys
from pathlib import Path

claude_json, mcp_pkg, api_url = sys.argv[1], sys.argv[2], sys.argv[3]
config_dir = Path.home() / ".config" / "fleetseek"
fs_cfg = json.loads((config_dir / "config.json").read_text())
api_key = fs_cfg["api_key"]
robot_id = fs_cfg.get("robot_id", "")

p = Path(claude_json)
data = json.loads(p.read_text()) if p.exists() else {}
servers = data.setdefault("mcpServers", {})
servers["fleetseek"] = {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", f"{mcp_pkg}@latest"],
    "env": {
        "FLEETSEEK_API_URL": api_url,
        "FLEETSEEK_API_KEY": api_key,
        "FLEETSEEK_ROBOT_ID": robot_id,
    },
}
p.write_text(json.dumps(data, indent=2))
print(f"  Wrote: {p}")
PY

echo ""
echo "✓ FleetSeek installed."
echo ""
echo "Auto-update is enabled — every Claude Code restart fetches the latest"
echo "$MCP_PKG via npx @latest."
echo ""
echo "Next step: restart Claude Code and run /mcp to confirm 'fleetseek' is connected."
echo ""
