# anythropic

Use Any model as Anthropic. Any-thropic is a bidirectional proxy that makes any AI API work like Anthropic's Claude API. Perfect for using OpenAI compatible models in Claude Code and Claude Agent SDK, or using Claude models in Codex and other OpenAI compatible tools.

**Any + Anthropic = anythropic**

## Deploy

```bash
pnpm install
pnpm wrangler login
pnpm run deploy
```

## Usage

### Use Gemini in Claude Code

Set env variables:

```bash
export ANTHROPIC_BASE_URL="https://your-worker.workers.dev/generativelanguage.googleapis.com/v1beta/openai"
export ANTHROPIC_AUTH_TOKEN="..."  # Gemini API key
export ANTHROPIC_MODEL="gemini-3-pro-preview"
export ANTHROPIC_SMALL_FAST_MODEL="gemini-2.5-flash"
```

### Use Claude in OpenAI Codex

```
[model_providers.claude]
name = "Claude"
base_url = "https://your-worker.workers.dev/api.anthropic.com/"
env_http_headers = { "x-api-key" = "claude api key" }
```

### How It Works

The worker extracts the target API URL from the request path:

```

https://worker.workers.dev/{target-api-url}/{endpoint}

```

Examples:

- Claude Code send request to `https://your-worker.workers.dev/generativelanguage.googleapis.com/v1beta/openai/v1/messages`
- The worker extract information and transform payload and send request to `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
- The worker receives response from Gemini then transform it to Claude format and respond back to Claude Code

No configuration needed.

## Development

```bash
pnpm install
pnpm run dev
pnpm tsc --noEmit
pnpm run deploy
```

## Project Structure

```
your-worker/
├── src/
│   └── index.ts
├── package.json
├── tsconfig.json
├── wrangler.toml
└── README.md
```

## License

MIT
