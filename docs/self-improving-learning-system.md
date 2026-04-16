# Self-Improving Learning System

OpenAgents now includes a **Self-Improving Learning System** inspired by MiniMax Hermes Agent. This system enables your AI agent to get smarter over time by learning from user interactions.

## Features

### 🧠 Pattern Recognition
The system automatically extracts and learns patterns from user interactions:

- **Preferences**: Communication style, tone, formatting preferences
- **Behaviors**: How users interact with the agent (questions vs. task creation)
- **Context**: Topics and domains the user works in (coding, research, writing)
- **Skills**: Successful task completions and agent capabilities used

### 📈 Adaptive Learning
The agent improves through:

1. **Interaction Tracking**: Every conversation is analyzed for patterns
2. **Pattern Confidence**: Repeated patterns increase confidence scores
3. **Context Injection**: Learned context is added to system prompts
4. **Learning Score**: Tracks overall improvement over time

### 🔄 Memory Enhancement
Persistent memory includes:
- Cross-session context retention
- User preference tracking
- Topic/domain expertise building
- Skill development indicators

## API Endpoints

### Track Interaction
```
POST /api/learning/track
```

Tracks a user interaction for learning:
```json
{
  "input": "Can you write a Python function to parse JSON?",
  "output": "Here is a Python function...",
  "context": "coding",
  "channel": "web",
  "success": true
}
```

### Get Learning Stats
```
GET /api/learning/stats
```

Returns learning statistics:
```json
{
  "sessions": 42,
  "patternsLearned": 15,
  "preferences": 8,
  "contextScore": 75,
  "improvementRate": 45,
  "topPatterns": ["context:coding", "behavior:task_creation"]
}
```

### Get Learned Patterns
```
GET /api/learning/patterns
```

Returns learned context patterns for the user.

### Get Enhanced Context
```
GET /api/learning/enhanced-context
```

Returns system prompt with learned context injected:
```json
{
  "enhancedPrompt": "You are a helpful AI assistant.\n\n---\n## 📚 Learned User Context (Adaptive)\n- User preference: concise responses\n- User works on: coding\n..."
}
```

### Clear Learning Data
```
DELETE /api/learning/clear
```

Clears all learning data for the user.

## Database Models

### LearningInteraction
Stores raw interaction data for analysis.

### LearnedPattern
Stores extracted patterns with confidence scores.

### LearningStats
Tracks user's learning progress and scores.

## Configuration

Environment variables:
- `LEARNING_MIN_CONFIDENCE`: Minimum confidence threshold (default: 0.3)
- `LEARNING_MIN_FREQUENCY`: Minimum occurrences for pattern (default: 3)
- `LEARNING_MAX_PATTERNS`: Maximum patterns per user (default: 100)

## Benefits

1. **Personalization**: Responses become more tailored over time
2. **Efficiency**: Agent learns to handle recurring tasks faster
3. **Context Awareness**: Better understanding of user needs
4. **Continuous Improvement**: Agent gets smarter with every interaction

## Integration with CLI

The CLI automatically tracks interactions when you use `openagents chat`:

```bash
openagents chat --context "I'm a software developer"
```

Your learned patterns can be viewed with:

```bash
openagents learn
```

This displays:
- Sessions completed
- Patterns learned
- Context understanding score
- Improvement rate
