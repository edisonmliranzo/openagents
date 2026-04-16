# OpenAgents CLI

A powerful command-line interface for interacting with the OpenAgents AI platform, inspired by MiniMax Hermes Agent.

## Installation

```bash
# From the project directory
cd apps/cli
npm install
npm run build

# Or use globally
npm install -g
```

## Quick Start

```bash
# Start an interactive chat session
openagents chat

# Send a single message
openagents send "Hello, how are you?"

# Check platform status
openagents status
```

## Commands

### `chat`
Start an interactive chat session with the AI agent.

```bash
openagents chat [options]

Options:
  -c, --context <context>  Initial context/prompt
  -m, --model <model>      LLM model to use
  -u, --url <url>          API server URL (default: http://localhost:3000)
  -k, --api-key <key>      API key for authentication
  --no-color               Disable colors
```

Example:
```bash
# Start chat with coding context
openagents chat --context "I'm a Python developer"

# Use specific model
openagents chat --model claude-sonnet-4-6

# Connect to custom server
openagents chat --url https://api.example.com --api-key your-key
```

### `send`
Send a single message and exit.

```bash
openagents send <message> [options]

Options:
  -c, --context <context>  Additional context
  -m, --model <model>      LLM model to use
  -u, --url <url>          API server URL
  -k, --api-key <key>      API key
```

Example:
```bash
openagents send "What is 2+2?" --context "quick math question"
```

### `memory`
View and manage agent memory.

```bash
openagents memory [options]

Options:
  --list              List all memories
  --search <query>     Search memories
  --clear             Clear all memories
  -u, --url <url>      API server URL
  -k, --api-key <key> API key
```

Example:
```bash
# List all stored memories
openagents memory --list

# Search for specific memory
openagents memory --search "Python"

# Clear all memories
openagents memory --clear
```

### `status`
Check platform status and health.

```bash
openagents status [options]

Options:
  -u, --url <url>      API server URL
  -k, --api-key <key> API key
```

Example:
```bash
openagents status
```

Output:
```
🏥 Platform Status:

✓ API Server: healthy
✓ Database: connected
✓ Memory Store: active

📊 Active Agents: 5
📊 Active Sessions: 12
```

### `config`
Configure CLI settings.

```bash
openagents config [options]

Options:
  --set-url <url>     Set default API URL
  --set-key <key>     Set default API key
  --show              Show current configuration
```

Example:
```bash
# Show current config
openagents config --show

# Set default API URL
openagents config --set-url https://api.example.com

# Set default API key
openagents config --set-key your-api-key
```

### `learn`
View learning statistics and insights from the Self-Improving Learning System.

```bash
openagents learn [options]

Options:
  -u, --url <url>      API server URL
  -k, --api-key <key> API key
```

Example:
```bash
openagents learn
```

Output:
```
╔═══════════════════════════════════════════════════════════╗
║  🧠 OpenAgents Learning Insights                          ║
╚═══════════════════════════════════════════════════════════╝

Sessions Completed: 42
Patterns Learned: 15
Preferences Captured: 8
Context Understanding: 75%
Improvement Rate: 45%

🔝 Top Learned Patterns:
  1. context:coding
  2. behavior:task_creation
  3. style:concise
```

## Environment Variables

The CLI supports environment variables for configuration:

```bash
export OPENAGENTS_API_URL=http://localhost:3000
export OPENAGENTS_API_KEY=your-api-key
```

## Interactive Features

- **Colored output**: Visual feedback with colors for better readability
- **Loading spinners**: Show progress during API calls
- **Auto-save**: Conversations are automatically saved to memory
- **Learning tracking**: Interactions are tracked for continuous improvement

## Keyboard Shortcuts

- `Ctrl+C`: Exit chat session
- Type `exit`, `quit`, or `q`: End session

## Troubleshooting

### Connection Issues
```bash
# Check if server is running
openagents status

# Use explicit URL
openagents chat --url http://localhost:3000
```

### Authentication
```bash
# Set your API key
openagents config --set-key your-api-key
```

## Shell Integration

Use with shell pipes:

```bash
echo "Hello" | openagents send "$(cat)"

# Or capture output
response=$(openagents send "Hello" --context "testing")
echo "$response"
```

## Scripting

Create scripts for automation:

```bash
#!/bin/bash
# backup-memory.sh
openagents memory --list > memory-backup.txt
openagents memory --search "important" >> memory-backup.txt
```

## Related Documentation

- [Self-Improving Learning System](self-improving-learning-system.md)
- [Multi-Agent Architecture](multi-agent-architecture.md)
- [API Documentation](../apps/api/README.md)
