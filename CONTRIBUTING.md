# Contributing to Discord Voice AI Bot

Thanks for your interest! This is a small, focused project and contributions are very welcome. 🎉

## Reporting Bugs

Open a [GitHub Issue](../../issues) with:
- What you expected vs. what happened
- Steps to reproduce
- Your Node.js version and OS
- Relevant log output (redact API keys!)

## Suggesting Features

Open an issue with the **feature request** label. Describe the use case and why it would be useful. Quick ideas are fine — no need for a full spec.

## Submitting Pull Requests

1. Fork the repo and create a branch from `main`
2. `npm install` and copy `.env.example` to `.env`
3. Make your changes
4. Test locally with `npm start` (you need a Discord bot token + Groq key at minimum)
5. Open a PR with a clear description of what changed and why

Keep PRs small and focused — one feature or fix per PR.

## Code Style

- **Plain Node.js** — no TypeScript, no build step
- All source lives in `src/`
- Configuration goes through `.env` (parsed via `dotenv`). Add new vars to `.env.example` with sensible defaults
- Use `const`/`let`, never `var`
- Prefer `async`/`await` over raw Promises
- No extra linters enforced yet — just keep it consistent with what's already there

## Good First Contributions

- Improving docs or README
- Adding a new TTS or LLM provider
- Better error messages / logging
- Writing tests (we have none yet — you'd be a hero)

## Questions?

Open an issue or start a discussion. No question is too small. 🙌
