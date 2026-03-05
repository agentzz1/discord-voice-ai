<p align="center">
  <h1 align="center">🎙️ discord-voice-ai</h1>
  <p align="center">
    <strong>Talk to AI in Discord voice channels — self-hosted, free-tier APIs, full voice-in/voice-out</strong>
  </p>
  <p align="center">
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-features">Features</a> •
    <a href="#-supported-providers">Providers</a> •
    <a href="#%EF%B8%8F-configuration">Configuration</a> •
    <a href="#-commands">Commands</a>
  </p>
  <p align="center">
    <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green.svg" />
    <img alt="Node.js 20+" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" />
    <img alt="discord.js v14" src="https://img.shields.io/badge/discord.js-v14-5865F2.svg" />
    <img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" />
  </p>
</p>

---

A Discord bot that **joins your voice channel, listens to what people say, thinks with an LLM, and talks back** — like having a team member who's always awake and always has an answer.

Runs entirely on **free-tier APIs** (Groq for STT + LLM, Google TTS for speech). Add ElevenLabs for premium voice quality. No cloud hosting required — runs on your machine.

## 🎬 Demo

<p align="center">
  <img src="https://readme-typing-svg.demolab.com/?font=Fira+Code&weight=500&size=15&pause=1000&color=10B981&background=0D1117&width=550&height=120&lines=%5B%2B%5D+Bot+logged+into+Discord!;%5BVoice%5D+User+joined+%23General;%5BSTT%5D+Transcribing...+%22Hello+AI!%22;%5BLLM%5D+Thinking...+Generating+response;%5BTTS%5D+Playing+audio+in+voice+channel;%5B%2B%5D+Ready+for+next+command" alt="Terminal Demo" />
</p>

> *💡 Tip: Replace this animated terminal placeholder with a real 30s screen-recording GIF of the bot inside a Discord voice channel!*

## 🚀 Quick Start

**1. Clone & install**

```bash
git clone https://github.com/agentzz1/discord-voice-ai.git
cd discord-voice-ai
npm install
```

**2. Configure**

```bash
cp .env.example .env
# Fill in DISCORD_TOKEN and GROQ_API_KEY (both free)
```

**3. Run**

```bash
npm start
```

That's it. Type `!join` in any text channel while in a voice channel, and start talking.

## ✨ Features

| | Feature | Description |
|---|---|---|
| 🎤 | **Voice-in / Voice-out** | Listens to speech, responds with speech — full duplex voice AI |
| 🧠 | **LLM-powered responses** | Groq (LLaMA) or Google Vertex AI (Gemini) for intelligent replies |
| 🗣️ | **Speech-to-Text** | Groq Whisper-compatible STT — fast and free |
| 🔊 | **Text-to-Speech** | ElevenLabs (premium) or Google TTS (free fallback) |
| 🤖 | **Auto-join** | Automatically joins voice channels when users are present |
| 💾 | **Conversation memory** | Per-channel context that persists across rejoins |
| 🛡️ | **Smart filters** | Cooldown, deduplication, echo guard, noise filtering, gibberish detection |
| 🗝️ | **Wake word detection** | Only respond when addressed (configurable wake words) |
| 🎛️ | **40+ settings** | Fine-tune every aspect via `.env` |
| 🫡 | **Courtesy filter** | Ignores filler phrases like "thanks", "ok", "yeah" |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Discord Voice Channel                │
│                                                         │
│  User speaks ──► Opus stream captured per speaker       │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  Audio Processing   │
                │  PCM → WAV file     │
                │  Silence detection  │
                │  Noise filtering    │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │   Groq Whisper STT  │  ◄── Speech-to-Text (free)
                │   Transcription     │
                └──────────┬──────────┘
                           │
                    ┌──────┴──────┐
                    ▼             ▼
             ┌───────────┐ ┌───────────┐
             │   Filters  │ │  Memory   │
             │ cooldown   │ │ per-chan   │
             │ dedup      │ │ context   │
             │ echo guard │ │           │
             │ courtesy   │ │           │
             └──────┬─────┘ └─────┬─────┘
                    │             │
                    └──────┬──────┘
                           ▼
                ┌─────────────────────┐
                │    LLM Provider     │
                │  Groq (LLaMA)   or  │  ◄── Chat completion (free)
                │  Vertex AI (Gemini) │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │    TTS Provider     │
                │  ElevenLabs    or   │  ◄── Text-to-Speech
                │  Google TTS         │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  Bot speaks in the  │
                │  voice channel 🔊   │
                └─────────────────────┘
```

## 🔌 Supported Providers

### Speech-to-Text (STT)

| Provider | Model | Cost |
|----------|-------|------|
| **Groq** | `whisper-large-v3-turbo` | ✅ Free tier |

### LLM (Chat)

| Provider | Model | Cost |
|----------|-------|------|
| **Groq** | `llama-3.1-8b-instant` | ✅ Free tier |
| **Google Vertex AI** | `gemini-2.5-flash` | ✅ Free / very cheap |

### Text-to-Speech (TTS)

| Provider | Quality | Cost |
|----------|---------|------|
| **ElevenLabs** | 🔥 Premium, natural voices | Paid (free tier available) |
| **Google TTS** | 👍 Decent, robotic | ✅ Free |

> **Tip:** The bot auto-selects ElevenLabs when `ELEVENLABS_API_KEY` is set, otherwise falls back to Google TTS.

## 💬 Commands

| Command | Description |
|---------|-------------|
| `!join` | Bot joins your current voice channel |
| `!leave` | Bot leaves the voice channel |
| `!say <text>` | Speak arbitrary text (TTS test) |
| `!help` | Show available commands |

> The command prefix is configurable via `BOT_PREFIX` (default: `!`).

## ⚙️ Configuration

All settings live in `.env`. Copy `.env.example` to get started.

### Required

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Your Discord bot token |
| `GROQ_API_KEY` | Groq API key ([console.groq.com](https://console.groq.com)) |

### LLM Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `groq` | `groq` or `vertex` |
| `GROQ_CHAT_MODEL` | `llama-3.1-8b-instant` | Groq chat model |
| `GROQ_TRANSCRIBE_MODEL` | `whisper-large-v3-turbo` | Groq STT model |
| `VERTEX_API_KEY` | — | Google Vertex AI API key |
| `VERTEX_MODEL` | `gemini-2.5-flash` | Vertex AI model |
| `VERTEX_PROJECT_ID` | — | GCP project (optional for express mode) |
| `VERTEX_LOCATION` | `global` | Vertex AI region |

### TTS Provider

| Variable | Default | Description |
|----------|---------|-------------|
| `TTS_PROVIDER` | auto | `elevenlabs` or `google` (auto-detected from API key) |
| `ELEVENLABS_API_KEY` | — | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | `JBFqnCBsd6RMkjVDRZzb` | Voice ID (default: "George") |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | ElevenLabs model |
| `ELEVENLABS_VOICE_PRESET` | `balanced` | `balanced`, `aggressive`, or `intense` |

### Behavior & Filters

| Variable | Default | Description |
|----------|---------|-------------|
| `BOT_LANGUAGE` | `de` | Bot language (ISO 639-1) |
| `BOT_PREFIX` | `!` | Command prefix |
| `AUTO_JOIN_VOICE_CHANNELS` | `true` | Auto-join channels with users |
| `AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS` | `60000` | Cooldown after `!leave` before auto-rejoin |
| `GLOBAL_REPLY_COOLDOWN_MS` | `4500` | Min ms between any two replies |
| `USER_REPLY_COOLDOWN_MS` | `7000` | Min ms between replies to the same user |
| `BOT_ECHO_GUARD_MS` | `2200` | Ignore audio captured during bot speech |
| `DUPLICATE_TRANSCRIPT_WINDOW_MS` | `20000` | Window for duplicate transcript detection |
| `MIN_TRANSCRIPT_CHARS` | `3` | Minimum characters to process |
| `MIN_TRANSCRIPT_WORDS` | `2` | Minimum words to process |
| `IGNORE_COURTESY_ONLY` | `true` | Skip filler phrases ("ok", "thanks") |
| `CHAT_MAX_TOKENS` | `220` | Max tokens for LLM response |
| `MAX_TTS_CHARS` | `420` | Max characters sent to TTS |
| `MEMORY_MAX_MESSAGES` | `24` | Conversation history length per channel |
| `MEMORY_MAX_CHARS` | `7000` | Max characters in conversation memory |
| `BOT_WAKE_WORDS` | `bot,discord bot` | Comma-separated wake words |
| `TTS_ERROR_NOTIFY_COOLDOWN_MS` | `60000` | Rate-limit TTS error notifications |

## 📋 Prerequisites

- **Node.js 20+**
- **FFmpeg** (bundled via `ffmpeg-static`, or set `FFMPEG_PATH`)
- A Discord bot with these intents enabled:
  - `MESSAGE CONTENT INTENT`
  - `SERVER MEMBERS INTENT` (optional)
- API keys: `DISCORD_TOKEN` + `GROQ_API_KEY` (both free)

## 🤔 Why This Exists

Most Discord AI bots are text-only. The few voice bots out there require expensive APIs or complex setups.

**discord-voice-ai** is different:

- 🆓 **Free to run** — Groq's free tier handles both STT and LLM
- 🏠 **Self-hosted** — Your data stays on your machine
- 🎯 **Simple** — One `npm install`, one `.env` file, done
- 🧠 **Smart** — Echo guards, cooldowns, and dedup filters prevent the bot from talking to itself or spamming
- 🔊 **Actually talks** — Full voice-in, voice-out. Not just text responses

## 🤝 Contributing

Contributions are welcome! Here's how:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Ideas for contributions

- [ ] Slash command support (`/join`, `/leave`)
- [ ] Multi-language system prompts
- [ ] Web dashboard for configuration
- [ ] Support for more LLM providers (OpenAI, Anthropic, Ollama)
- [ ] Per-user voice recognition and personalized responses

## 📜 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## ⭐ Star History

If you find this project useful, please consider giving it a star! It helps others discover it.

[![Star History Chart](https://api.star-history.com/svg?repos=agentzz1/discord-voice-ai&type=Date)](https://star-history.com/#agentzz1/discord-voice-ai&Date)

---

<p align="center">
  <strong>Built with ❤️ for the Discord community</strong><br/>
  <sub>If this bot made your server more fun, drop a ⭐ on the repo!</sub>
</p>
