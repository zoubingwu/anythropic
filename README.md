# Anythropic

Use Any model as Anthropic. Any-thropic is a proxy that makes any AI API work like Anthropic's Claude API. Perfect for using OpenAI compatible models in Claude Code.

**Any + Anthropic = anythropic**

## Usage

Just set env variables, use `{worker_host}/{original_base_url}` format for your ANTHROPIC_BASE_URL.

> [!NOTE]
> It is recommended to deploy to your own Cloudflare Worker for complete control and privacy.
> Or Use `anythropic.web7.workers.dev` if you prefer. We don't store or log anything now, and never will. Code is 100% open source

```bash
# for gemini
export ANTHROPIC_BASE_URL="https://anythropic.web7.workers.dev/generativelanguage.googleapis.com/v1beta/openai"
export ANTHROPIC_AUTH_TOKEN=your Gemini API key
export ANTHROPIC_MODEL="gemini-3-pro-preview"
export ANTHROPIC_SMALL_FAST_MODEL="gemini-2.5-flash"

# for openai
export ANTHROPIC_BASE_URL="https://anythropic.web7.workers.dev/api.openai.com"
export ANTHROPIC_AUTH_TOKEN=$OPENAI_API_KEY
export ANTHROPIC_MODEL=gpt-5
export ANTHROPIC_SMALL_FAST_MODEL=gpt-5-mini

# for copilot
export ANTHROPIC_BASE_URL="https://anythropic.web7.workers.dev/api.githubcopilot.com"
export ANTHROPIC_AUTH_TOKEN=you personal access token
export ANTHROPIC_MODEL=grok-code-fast-1
export ANTHROPIC_SMALL_FAST_MODEL=grok-code-fast-1
```

> [!TIP]
> To get your personal access token for Copilot, you can install the [GitHub Copilot CLI](https://github.com/cli/cli), then run `/login`. The token can be found in `~/.config/github-copilot/apps.json`.


You can setup a util function in your, for example, .zshrc, then use `cc copliot` or `cc gemini` to start your Claude Code with selected model provider:

```bash
cc() {
  case $1 in
    gemini)
        export ANTHROPIC_BASE_URL="https://anythropic.web7.workers.dev/generativelanguage.googleapis.com/v1beta/openai"
        ...
        claude
        ;;
    openai)
        export ANTHROPIC_BASE_URL="https://anythropic.web7.workers.dev/api.openai.com"
        ...
        claude
        ;;
    copilot)
        export ANTHROPIC_BASE_URL="https://anythropic.web7.workers.dev/api.githubcopilot.com"
        ...
        claude
        ;;
    *)
        echo "Unknown option: $1"
        ;;
  esac
}
```

## Self-host

Deploy to cloudflare worker:

```bash
pnpm install
pnpm wrangler login
pnpm run deploy
```

Or running locally:

```bash
pnpm install
pnpm dev
```

Then replace the worker_host in your env with your own worker or localhost.

## Inspiration and appreciation

- https://github.com/labring/aiproxy
- https://github.com/1rgs/claude-code-proxy

## License

MIT
