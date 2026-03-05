require("dotenv").config();

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");

try {
  if (!process.env.FFMPEG_PATH) {
    process.env.FFMPEG_PATH = require("ffmpeg-static");
  }
} catch {
  // Falls ffmpeg-static nicht geladen werden kann, gibt es später eine klare Fehlermeldung beim Abspielen.
}

const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  entersState,
  StreamType,
} = require("@discordjs/voice");
const prism = require("prism-media");
const wav = require("wav");
const OpenAI = require("openai");
const googleTTS = require("google-tts-api");
const { request } = require("undici");

const REQUIRED_ENV = ["DISCORD_TOKEN"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Fehlende Umgebungsvariable: ${key}`);
    process.exit(1);
  }
}

const PREFIX = process.env.BOT_PREFIX || "!";
const BOT_LANGUAGE = process.env.BOT_LANGUAGE || "de";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "llama-3.1-8b-instant";
const GROQ_TRANSCRIBE_MODEL =
  process.env.GROQ_TRANSCRIBE_MODEL || "whisper-large-v3-turbo";
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "groq").toLowerCase();
const VERTEX_API_KEY = process.env.VERTEX_API_KEY || "";
const VERTEX_BASE_URL = process.env.VERTEX_BASE_URL || "https://aiplatform.googleapis.com";
const VERTEX_PROJECT_ID = process.env.VERTEX_PROJECT_ID || "";
const VERTEX_LOCATION = (process.env.VERTEX_LOCATION || "global").trim();
const VERTEX_MODEL = process.env.VERTEX_MODEL || "gemini-2.5-flash";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_BASE_URL = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb"; // "George" (starke, klare Stimme)
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const ELEVENLABS_VOICE_PRESET = (process.env.ELEVENLABS_VOICE_PRESET || "balanced").toLowerCase();
const ELEVENLABS_STABILITY = parseEnvFloat(process.env.ELEVENLABS_STABILITY, null);
const ELEVENLABS_SIMILARITY_BOOST = parseEnvFloat(process.env.ELEVENLABS_SIMILARITY_BOOST, null);
const ELEVENLABS_STYLE = parseEnvFloat(process.env.ELEVENLABS_STYLE, null);
const ELEVENLABS_USE_SPEAKER_BOOST =
  process.env.ELEVENLABS_USE_SPEAKER_BOOST == null || process.env.ELEVENLABS_USE_SPEAKER_BOOST === ""
    ? null
    : parseEnvBool(process.env.ELEVENLABS_USE_SPEAKER_BOOST, true);
const TTS_PROVIDER = (
  process.env.TTS_PROVIDER || (ELEVENLABS_API_KEY ? "elevenlabs" : "google")
).toLowerCase();
const AUTO_JOIN_VOICE_CHANNELS = parseEnvBool(process.env.AUTO_JOIN_VOICE_CHANNELS, true);
const AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS = Number.parseInt(
  process.env.AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS || "60000",
  10,
);
const AUTO_JOIN_RETRY_COOLDOWN_MS = Number.parseInt(
  process.env.AUTO_JOIN_RETRY_COOLDOWN_MS || "15000",
  10,
);
const GLOBAL_REPLY_COOLDOWN_MS = parseEnvInt(process.env.GLOBAL_REPLY_COOLDOWN_MS, 4500);
const USER_REPLY_COOLDOWN_MS = parseEnvInt(process.env.USER_REPLY_COOLDOWN_MS, 7000);
const BOT_ECHO_GUARD_MS = parseEnvInt(process.env.BOT_ECHO_GUARD_MS, 2200);
const DUPLICATE_TRANSCRIPT_WINDOW_MS = parseEnvInt(
  process.env.DUPLICATE_TRANSCRIPT_WINDOW_MS,
  20000,
);
const MIN_TRANSCRIPT_CHARS = parseEnvInt(process.env.MIN_TRANSCRIPT_CHARS, 3);
const MIN_TRANSCRIPT_WORDS = parseEnvInt(process.env.MIN_TRANSCRIPT_WORDS, 2);
const CHAT_MAX_TOKENS = parseEnvInt(process.env.CHAT_MAX_TOKENS, 220);
const MAX_TTS_CHARS = parseEnvInt(process.env.MAX_TTS_CHARS, 420);
const MEMORY_MAX_MESSAGES = parseEnvInt(process.env.MEMORY_MAX_MESSAGES, 24);
const MEMORY_MAX_CHARS = parseEnvInt(process.env.MEMORY_MAX_CHARS, 7000);
const BOT_WAKE_WORDS = parseCsvEnv(process.env.BOT_WAKE_WORDS, ["bot", "discord bot"]);
const IGNORE_COURTESY_ONLY = parseEnvBool(process.env.IGNORE_COURTESY_ONLY, true);
const TTS_ERROR_NOTIFY_COOLDOWN_MS = parseEnvInt(process.env.TTS_ERROR_NOTIFY_COOLDOWN_MS, 60000);
const MIN_PCM_BYTES = 48_000; // ~0.25s bei 48kHz stereo 16-bit
const RECORDINGS_DIR = path.join(process.cwd(), "tmp-recordings");
const STT_LANGUAGE = normalizeSttLanguage(BOT_LANGUAGE);
const GOOGLE_TTS_LANGUAGE = normalizeGoogleTtsLanguage(BOT_LANGUAGE);

if (!process.env.GROQ_API_KEY) {
  console.error(
    "Fehlende Umgebungsvariable: GROQ_API_KEY (wird aktuell fuer Sprach-Transkription verwendet)",
  );
  process.exit(1);
}

if (LLM_PROVIDER === "vertex" && !VERTEX_API_KEY) {
  console.error("LLM_PROVIDER=vertex gesetzt, aber VERTEX_API_KEY fehlt.");
  process.exit(1);
}

if (!["groq", "vertex"].includes(LLM_PROVIDER)) {
  console.error(`Ungueltiger LLM_PROVIDER: ${LLM_PROVIDER}. Erlaubt: groq, vertex`);
  process.exit(1);
}

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: GROQ_BASE_URL,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

/** @type {Map<string, any>} */
const sessions = new Map();
/** @type {Map<string, number>} */
const autoJoinCooldowns = new Map();
/** @type {Map<string, Promise<void>>} */
const autoJoinReconcileQueues = new Map();
/** @type {Map<string, any>} */
const channelMemories = new Map();

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function parseEnvBool(value, defaultValue) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function parseEnvInt(value, defaultValue) {
  if (value == null || value === "") return defaultValue;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseEnvFloat(value, defaultValue) {
  if (value == null || value === "") return defaultValue;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseCsvEnv(value, fallback) {
  if (value == null || String(value).trim() === "") return fallback;
  const parts = String(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return parts.length ? parts : fallback;
}

function normalizeSttLanguage(language) {
  const base = String(language || "de").trim();
  if (!base) return "de";
  return base.slice(0, 2).toLowerCase();
}

function normalizeGoogleTtsLanguage(language) {
  const value = String(language || "de").trim();
  if (!value) return "de";
  const primary = value.slice(0, 2).toLowerCase();
  if (primary === "de") return "de";
  return primary;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function resolveElevenLabsVoiceSettings() {
  const presets = {
    balanced: {
      stability: 0.35,
      similarity_boost: 0.8,
      style: 0.35,
      use_speaker_boost: true,
    },
    aggressive: {
      // Mehr Punch/Charakter, etwas weniger Stabilitaet, hoher Style.
      stability: 0.18,
      similarity_boost: 0.88,
      style: 0.92,
      use_speaker_boost: true,
    },
    intense: {
      stability: 0.12,
      similarity_boost: 0.9,
      style: 1.0,
      use_speaker_boost: true,
    },
  };

  const base = presets[ELEVENLABS_VOICE_PRESET] || presets.balanced;

  return {
    stability: clamp01(ELEVENLABS_STABILITY ?? base.stability),
    similarity_boost: clamp01(ELEVENLABS_SIMILARITY_BOOST ?? base.similarity_boost),
    style: clamp01(ELEVENLABS_STYLE ?? base.style),
    use_speaker_boost:
      typeof ELEVENLABS_USE_SPEAKER_BOOST === "boolean"
        ? ELEVENLABS_USE_SPEAKER_BOOST
        : base.use_speaker_boost,
  };
}

async function ensureRecordingsDir() {
  await fsp.mkdir(RECORDINGS_DIR, { recursive: true });
}

function getMemberVoiceChannel(message) {
  return message.member?.voice?.channel ?? null;
}

function buildSystemPrompt() {
  return [
    "Du bist ein hilfreicher Discord-Sprachassistent in einem Voice-Channel.",
    "Antworte natuerlich, klar und auf Deutsch.",
    "Nutze den bisherigen Gespraechskontext im Channel.",
    "Bei einfachen Fragen kurz, bei komplexeren Fragen 2 bis 5 Saetze.",
    "Wenn Audio oder Frage unklar ist, sage klar dass du nur Bruchstuecke verstanden hast und frage kurz nach.",
    "Rate nicht und erfinde keine Details aus undeutlichem Audio.",
    "Wiederhole nicht staendig Meta-Saetze wie 'ich bin hier um zu helfen'.",
    "Wiederhole keine Beleidigungen oder diskriminierende Begriffe aus Nutzertexten.",
    "Du bist ein Discord-Voice-Bot. Sage nicht, dass du nur ein Text-Assistent ohne Stimme bist.",
    "Du kannst keine externen Aktionen ausfuehren: keine Skills deaktivieren, keine Admins kontaktieren, keine Support-Tickets erstellen, keine Daten sichern.",
    "Behaupte niemals, dass du solche Aktionen ausfuehrst oder eingeleitet hast.",
    "Wenn jemand solche Aktionen fordert, sage kurz, dass das nicht geht und nenne nur die realen Befehle (!join, !leave, !help).",
    "Keine Emojis.",
    "Kein unnötiges Fuellgerede.",
  ].join(" ");
}

function normalizeTranscriptText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[„]/g, '"')
    .trim();
}

function canonicalizeTranscript(text) {
  return normalizeTranscriptText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text) {
  const matches = normalizeTranscriptText(text).match(/\p{L}[\p{L}\p{N}-]*/gu);
  return matches ? matches.length : 0;
}

function looksLikeNoiseTranscript(text) {
  const clean = normalizeTranscriptText(text);
  if (!clean) return true;
  if (clean.length < MIN_TRANSCRIPT_CHARS) return true;

  const words = countWords(clean);
  const lower = clean.toLowerCase();

  if (
    words <= 1 &&
    /^(hm+|mhm+|hmm+|uh+|uhm+|mm+|äh+|ähm+|eh+|ja+|ne+|nee+|ok+|okay+|jo+|lol+|haha+|hahaha+)$/.test(
      lower,
    )
  ) {
    return true;
  }

  if (words === 0) return true;
  if (words < MIN_TRANSCRIPT_WORDS && !looksDirectedAtBot(clean)) return true;

  return false;
}

function isCourtesyOnlyTranscript(text) {
  const lower = canonicalizeTranscript(text);
  if (!lower) return false;

  return [
    /^(vielen dank|danke|danke dir|danke schoen|dankeschon|thx|thanks|merci)$/,
    /^(bitte|gern(e)?|gerne danke|kein problem|alles klar|ok(ay)?|jo|ja)$/,
    /^(mhm|hmm|aha|nice|stark|top)$/,
  ].some((pattern) => pattern.test(lower));
}

function looksLikelyGibberish(text) {
  const clean = normalizeTranscriptText(text);
  if (!clean) return true;

  const words = clean.match(/\p{L}[\p{L}\p{N}-]*/gu) || [];
  if (words.length === 0) return true;

  // Viele STT-Fehltranskripte enthalten extrem kurze/zerhackte Token-Ketten.
  const veryShortWordRatio = words.filter((w) => w.length <= 2).length / words.length;
  if (words.length >= 6 && veryShortWordRatio > 0.6 && !looksDirectedAtBot(clean)) {
    return true;
  }

  const uniqueRatio = new Set(words.map((w) => w.toLowerCase())).size / words.length;
  if (words.length >= 5 && uniqueRatio < 0.35) {
    return true;
  }

  return false;
}

function isLikelyParrotedBotText(memory, transcript) {
  const lastAssistant = [...memory.history].reverse().find((msg) => msg?.role === "assistant");
  if (!lastAssistant?.content) return false;

  const a = canonicalizeTranscript(lastAssistant.content);
  const b = canonicalizeTranscript(transcript);
  if (!a || !b) return false;

  if (a === b) return true;

  // Troll-Fall: Nutzer liest den letzten Bot-Text halb vor.
  if (a.length >= 40 && b.length >= 30 && (a.includes(b) || b.includes(a.slice(0, Math.min(a.length, 120))))) {
    return true;
  }

  return false;
}

function buildHardCapabilityReply(transcript) {
  const lower = normalizeTranscriptText(transcript).toLowerCase();

  if (
    /(discord-?skill|skill .*deaktiv|modul .*abschalt|abschalt.*modul|support-bericht|support report|systemadministr)/.test(
      lower,
    )
  ) {
    return "Das kann ich nicht. Ich kann keinen Skill deaktivieren oder Systeme aendern. Nutze nur meine Discord-Befehle wie !join, !leave oder !help.";
  }

  if (/(aus dem .*channel.*raus|aus dem channel .*raus|verpiss|verlasse .*channel)/.test(lower)) {
    return "Ich kann den Voice-Channel nur ueber einen echten Discord-Befehl verlassen: !leave.";
  }

  if (/(wieder reinkommen|raus .* wieder rein|rejoin|neu joinen)/.test(lower)) {
    return "Direktes Rejoinen geht nur ueber Discord-Befehle: !leave und danach !join.";
  }

  if (/(kannst du .*stimme|warum .*stimme .*komisch|deine stimme)/.test(lower)) {
    return "Wenn meine Stimme komisch ist oder fehlt, ist gerade die Sprachausgabe gestört. Ich antworte dann nur im Chat.";
  }

  return null;
}

function looksDirectedAtBot(text) {
  const lower = normalizeTranscriptText(text).toLowerCase();
  if (!lower) return false;

  if (BOT_WAKE_WORDS.some((wakeWord) => lower.includes(wakeWord))) {
    return true;
  }

  // STT setzt Fragezeichen nicht immer; typische deutsche Fragemuster helfen hier als Cooldown-Bypass.
  return /^(wer|was|wie|wo|wann|warum|wieso|weshalb|kannst du|kannst du bitte|bitte|erklär|erklaer|sag mal)\b/i.test(
    lower,
  );
}

function getChannelMemoryKey(guildId, voiceChannelId) {
  return `${guildId}:${voiceChannelId}`;
}

function getOrCreateChannelMemory(guildId, voiceChannelId) {
  const key = getChannelMemoryKey(guildId, voiceChannelId);
  let memory = channelMemories.get(key);

  if (!memory) {
    memory = {
      key,
      history: [],
      lastReplyAt: 0,
      lastBotSpeechStartedAt: 0,
      lastBotSpeechEndedAt: 0,
      lastTtsErrorNotifyAt: 0,
      lastReplyByUser: new Map(),
      recentTranscriptByUser: new Map(),
      lastTouchedAt: Date.now(),
    };
    channelMemories.set(key, memory);
  }

  memory.lastTouchedAt = Date.now();
  return memory;
}

function pruneConversationHistory(memory) {
  while (memory.history.length > MEMORY_MAX_MESSAGES) {
    memory.history.shift();
  }

  let totalChars = memory.history.reduce(
    (sum, message) => sum + String(message?.content || "").length,
    0,
  );

  while (totalChars > MEMORY_MAX_CHARS && memory.history.length > 2) {
    const removed = memory.history.shift();
    totalChars -= String(removed?.content || "").length;
  }
}

function appendConversationHistory(memory, ...messages) {
  memory.history.push(...messages);
  memory.lastTouchedAt = Date.now();
  pruneConversationHistory(memory);
}

function trimForMemory(text) {
  const singleLine = normalizeTranscriptText(text);
  if (singleLine.length <= 700) return singleLine;
  return `${singleLine.slice(0, 697).trim()}...`;
}

function shouldIgnoreTranscript(session, userId, transcript) {
  const memory = session.memory;
  const now = Date.now();
  const clean = normalizeTranscriptText(transcript);

  memory.lastTouchedAt = now;

  if (session.botSpeaking) {
    return { ignore: true, reason: "bot-speaking" };
  }

  if (now - memory.lastBotSpeechEndedAt < BOT_ECHO_GUARD_MS) {
    return { ignore: true, reason: "echo-guard" };
  }

  if (looksLikeNoiseTranscript(clean)) {
    return { ignore: true, reason: "noise-short" };
  }

  if (IGNORE_COURTESY_ONLY && isCourtesyOnlyTranscript(clean)) {
    return { ignore: true, reason: "courtesy-only" };
  }

  if (isLikelyParrotedBotText(memory, clean)) {
    return { ignore: true, reason: "parroted-bot-text" };
  }

  const canonical = canonicalizeTranscript(clean);
  const directedAtBot = looksDirectedAtBot(clean);
  const lastSame = memory.recentTranscriptByUser.get(userId);

  if (
    lastSame &&
    lastSame.canonical === canonical &&
    now - lastSame.at < DUPLICATE_TRANSCRIPT_WINDOW_MS
  ) {
    return { ignore: true, reason: "duplicate" };
  }

  if (!directedAtBot && now - memory.lastReplyAt < GLOBAL_REPLY_COOLDOWN_MS) {
    return { ignore: true, reason: "global-cooldown" };
  }

  const lastUserReplyAt = memory.lastReplyByUser.get(userId) || 0;
  if (!directedAtBot && now - lastUserReplyAt < USER_REPLY_COOLDOWN_MS) {
    return { ignore: true, reason: "user-cooldown" };
  }

  memory.recentTranscriptByUser.set(userId, { canonical, at: now });
  for (const [key, value] of memory.recentTranscriptByUser.entries()) {
    if (now - value.at > DUPLICATE_TRANSCRIPT_WINDOW_MS) {
      memory.recentTranscriptByUser.delete(key);
    }
  }

  const likelyGibberish = looksLikelyGibberish(clean);
  return { ignore: false, transcript: clean, directedAtBot, likelyGibberish };
}

function setAutoJoinCooldown(guildId, ms) {
  autoJoinCooldowns.set(guildId, Date.now() + Math.max(0, ms));
}

function hasAutoJoinCooldown(guildId) {
  return Date.now() < (autoJoinCooldowns.get(guildId) || 0);
}

function getHumanVoiceMemberCount(channel) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return 0;

  let count = 0;
  for (const state of channel.guild.voiceStates.cache.values()) {
    if (state.channelId !== channel.id) continue;
    const member = state.member;
    if (!member || member.user?.bot) continue;
    count += 1;
  }
  return count;
}

function canBotJoinAndSpeak(channel) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  const me = channel.guild.members.me;
  if (!me) return true;

  const perms = channel.permissionsFor(me);
  if (!perms) return false;

  return (
    perms.has(PermissionFlagsBits.ViewChannel) &&
    perms.has(PermissionFlagsBits.Connect) &&
    perms.has(PermissionFlagsBits.Speak)
  );
}

function findBestActiveVoiceChannel(guild) {
  const candidates = [];

  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildVoice) continue;
    if (!canBotJoinAndSpeak(channel)) continue;

    const humans = getHumanVoiceMemberCount(channel);
    if (humans <= 0) continue;

    candidates.push({ channel, humans });
  }

  candidates.sort((a, b) => {
    if (b.humans !== a.humans) return b.humans - a.humans;
    return a.channel.position - b.channel.position;
  });

  return candidates[0]?.channel || null;
}

function pickDefaultTextChannelId(guild) {
  const me = guild.members.me;
  const ordered = [];

  if (guild.systemChannel?.type === ChannelType.GuildText) {
    ordered.push(guild.systemChannel);
  }

  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildText) continue;
    if (ordered.some((existing) => existing.id === channel.id)) continue;
    ordered.push(channel);
  }

  for (const channel of ordered) {
    const perms = me ? channel.permissionsFor(me) : null;
    if (perms) {
      if (!perms.has(PermissionFlagsBits.ViewChannel)) continue;
      if (!perms.has(PermissionFlagsBits.SendMessages)) continue;
    }
    return channel.id;
  }

  return null;
}

function enqueueAutoJoinReconcile(guild, reason) {
  const guildId = guild.id;
  const previous = autoJoinReconcileQueues.get(guildId) || Promise.resolve();

  const next = previous
    .then(async () => {
      await reconcileAutoJoinForGuild(guild, reason);
    })
    .catch((error) => {
      log(`[${guildId}] auto reconcile error`, error);
    })
    .finally(() => {
      if (autoJoinReconcileQueues.get(guildId) === next) {
        autoJoinReconcileQueues.delete(guildId);
      }
    });

  autoJoinReconcileQueues.set(guildId, next);
}

async function reconcileAutoJoinForGuild(guild, reason) {
  if (!AUTO_JOIN_VOICE_CHANNELS) return;

  const currentSession = sessions.get(guild.id);
  if (currentSession) {
    const currentChannel = guild.channels.cache.get(currentSession.voiceChannelId);
    const humansInCurrent = getHumanVoiceMemberCount(currentChannel);

    if (humansInCurrent > 0) {
      return;
    }

    log(`[${guild.id}] Auto-leave ${currentSession.voiceChannelId} (keine Nutzer mehr)`);
    await destroySession(guild.id);
  }

  if (hasAutoJoinCooldown(guild.id)) {
    return;
  }

  const target = findBestActiveVoiceChannel(guild);
  if (!target) return;

  await joinVoiceAuto(guild, target, reason);
}

function createSession(guildId, connection, textChannelId, voiceChannelId) {
  const memory = getOrCreateChannelMemory(guildId, voiceChannelId);
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  const session = {
    guildId,
    textChannelId,
    voiceChannelId,
    connection,
    player,
    activeCaptures: new Set(),
    processingQueue: Promise.resolve(),
    botSpeaking: false,
    memory,
    destroyed: false,
  };

  player.on(AudioPlayerStatus.Playing, () => {
    session.botSpeaking = true;
    session.memory.lastBotSpeechStartedAt = Date.now();
    session.memory.lastTouchedAt = Date.now();
  });

  player.on(AudioPlayerStatus.Idle, () => {
    session.botSpeaking = false;
    session.memory.lastBotSpeechEndedAt = Date.now();
    session.memory.lastTouchedAt = Date.now();
  });

  player.on("error", (error) => {
    log(`[${guildId}] Audio player error`, error);
  });

  connection.subscribe(player);

  connection.on("error", (error) => {
    log(`[${guildId}] Voice connection error`, error);
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    // Minimales Verhalten: Session sauber beenden.
    destroySession(guildId).catch((error) => {
      log(`[${guildId}] destroySession after disconnect failed`, error);
    });
  });

  connection.receiver.speaking.on("start", (userId) => {
    if (session.destroyed) return;
    if (session.activeCaptures.has(userId)) return;
    if (session.botSpeaking) return;
    if (Date.now() - session.memory.lastBotSpeechEndedAt < BOT_ECHO_GUARD_MS) return;

    const member = client.guilds.cache.get(guildId)?.voiceStates?.cache.get(userId)?.member;
    if (member?.user?.bot) return;

    void captureUtterance(session, userId);
  });

  return session;
}

async function joinVoiceAuto(guild, voiceChannel, reason) {
  if (sessions.has(guild.id)) return;

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    const textChannelId = pickDefaultTextChannelId(guild);
    const session = createSession(guild.id, connection, textChannelId, voiceChannel.id);
    sessions.set(guild.id, session);

    log(
      `[${guild.id}] Auto-joined voice channel "${voiceChannel.name}" (${reason}, users=${getHumanVoiceMemberCount(
        voiceChannel,
      )})`,
    );
  } catch (error) {
    try {
      connection.destroy();
    } catch {
      // ignore
    }

    setAutoJoinCooldown(guild.id, AUTO_JOIN_RETRY_COOLDOWN_MS);
    log(`[${guild.id}] Auto-join failed for "${voiceChannel.name}"`, error);
  }
}

function enqueueSessionWork(session, work) {
  session.processingQueue = session.processingQueue
    .then(async () => {
      if (session.destroyed) return;
      await work();
    })
    .catch((error) => {
      log(`[${session.guildId}] Queue error`, error);
    });
  return session.processingQueue;
}

async function captureUtterance(session, userId) {
  session.activeCaptures.add(userId);

  const filePath = path.join(
    RECORDINGS_DIR,
    `${session.guildId}-${userId}-${Date.now()}-${crypto.randomUUID()}.wav`,
  );

  let pcmBytes = 0;
  const opusStream = session.connection.receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 1200,
    },
  });

  const decoder = new prism.opus.Decoder({
    frameSize: 960,
    channels: 2,
    rate: 48_000,
  });

  const wavWriter = new wav.Writer({
    channels: 2,
    sampleRate: 48_000,
    bitDepth: 16,
  });

  const fileStream = fs.createWriteStream(filePath);

  const finished = new Promise((resolve, reject) => {
    opusStream.on("error", reject);
    decoder.on("error", reject);
    wavWriter.on("error", reject);
    fileStream.on("error", reject);
    fileStream.on("finish", resolve);
  });

  decoder.on("data", (chunk) => {
    pcmBytes += chunk.length;
  });

  opusStream.pipe(decoder).pipe(wavWriter).pipe(fileStream);

  try {
    await finished;

    if (pcmBytes < MIN_PCM_BYTES) {
      await safeUnlink(filePath);
      return;
    }

    await enqueueSessionWork(session, async () => {
      const transcript = await transcribeAudio(filePath);
      if (!transcript) return;

      const decision = shouldIgnoreTranscript(session, userId, transcript);
      if (decision.ignore) {
        log(`[${session.guildId}] Ignoriere Transkript (${decision.reason}): ${transcript}`);
        return;
      }

      const reply = await generateReply(session, userId, decision.transcript, decision);
      if (!reply) return;

      await speakReply(session, reply);
    });
  } catch (error) {
    log(`[${session.guildId}] captureUtterance failed`, error);
    await safeUnlink(filePath);
  } finally {
    session.activeCaptures.delete(userId);
  }
}

async function safeUnlink(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch {
    // ignore
  }
}

async function transcribeAudio(filePath) {
  try {
    const payload = {
      file: fs.createReadStream(filePath),
      model: GROQ_TRANSCRIBE_MODEL,
      language: STT_LANGUAGE,
      temperature: 0,
    };

    if (STT_LANGUAGE === "de") {
      payload.prompt =
        "Discord Voice Chat auf Deutsch. Transkribiere natuerlich auf Deutsch, keine Uebersetzung.";
    }

    const result = await groq.audio.transcriptions.create(payload);

    const text = normalizeTranscriptText(result?.text);
    await safeUnlink(filePath);

    if (!text) return null;
    log(`Transkript: ${text}`);
    return text;
  } catch (error) {
    log("Transcription error", error);
    await safeUnlink(filePath);
    return null;
  }
}

async function generateChatCompletionText(messages) {
  if (LLM_PROVIDER === "vertex") {
    return generateChatCompletionTextWithVertex(messages);
  }

  return generateChatCompletionTextWithGroq(messages);
}

async function generateChatCompletionTextWithGroq(messages) {
  const completion = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages,
    temperature: 0.55,
    max_tokens: CHAT_MAX_TOKENS,
  });

  return normalizeTranscriptText(completion.choices?.[0]?.message?.content);
}

function mapOpenAiMessagesToVertex(messages) {
  const contents = [];
  let systemInstruction = null;

  for (const message of messages) {
    const contentText = normalizeTranscriptText(message?.content);
    if (!contentText) continue;

    if (message.role === "system") {
      systemInstruction = {
        parts: [{ text: contentText }],
      };
      continue;
    }

    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: contentText }],
    });
  }

  return { systemInstruction, contents };
}

function buildVertexGenerateContentUrl() {
  const base = VERTEX_BASE_URL.replace(/\/+$/, "");
  const model = encodeURIComponent(VERTEX_MODEL);

  // Standard Vertex endpoint (mit Projekt/Location) falls konfiguriert, sonst API-Key Express-Endpoint.
  const pathPart = VERTEX_PROJECT_ID
    ? `/v1/projects/${encodeURIComponent(VERTEX_PROJECT_ID)}/locations/${encodeURIComponent(VERTEX_LOCATION)}/publishers/google/models/${model}:generateContent`
    : `/v1/publishers/google/models/${model}:generateContent`;

  const url = new URL(`${base}${pathPart}`);
  url.searchParams.set("key", VERTEX_API_KEY);
  return url.toString();
}

async function generateChatCompletionTextWithVertex(messages) {
  const { systemInstruction, contents } = mapOpenAiMessagesToVertex(messages);

  if (contents.length === 0) {
    return null;
  }

  const body = {
    contents,
    generationConfig: {
      temperature: 0.55,
      maxOutputTokens: CHAT_MAX_TOKENS,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  const response = await request(buildVertexGenerateContentUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.statusCode >= 400) {
    let details = "";
    try {
      details = String(await response.body.text());
    } catch {
      // ignore parse errors
    }
    throw new Error(
      `Vertex generateContent failed: HTTP ${response.statusCode}${details ? ` - ${details}` : ""}`,
    );
  }

  const data = await response.body.json();
  const candidate = data?.candidates?.[0];
  const finishReason = String(candidate?.finishReason || "");
  const blocked = candidate?.safetyRatings?.some((rating) => rating?.blocked === true);

  if (blocked) {
    return "Ich kann darauf gerade nicht sinnvoll antworten. Formuliere es bitte anders.";
  }

  const text = candidate?.content?.parts
    ?.map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join(" ")
    .trim();

  if (!text && finishReason) {
    log(`Vertex finishReason ohne Text: ${finishReason}`);
  }

  return normalizeTranscriptText(text);
}

async function generateReply(session, userId, transcript, decision = null) {
  const guild = client.guilds.cache.get(session.guildId);
  const member = guild?.voiceStates?.cache.get(userId)?.member || guild?.members?.cache.get(userId);
  const username = member?.displayName || member?.user?.username || "User";

  try {
    const memory = session.memory;
    const likelyGibberish = Boolean(decision?.likelyGibberish);
    const directedAtBot = Boolean(decision?.directedAtBot);
    const hardReply = buildHardCapabilityReply(transcript);

    if (hardReply) {
      const now = Date.now();
      appendConversationHistory(
        memory,
        { role: "user", content: trimForMemory(`${username} sagt im Sprachchat: ${transcript}`) },
        { role: "assistant", content: hardReply },
      );
      memory.lastReplyAt = now;
      memory.lastReplyByUser.set(userId, now);
      memory.lastTouchedAt = now;

      const textChannel = client.channels.cache.get(session.textChannelId);
      if (textChannel && textChannel.isTextBased()) {
        void textChannel.send(`**${username}:** ${transcript}\n**Bot:** ${hardReply}`);
      }

      return hardReply;
    }

    if (likelyGibberish) {
      if (!directedAtBot) {
        return null;
      }

      const fallbackReply =
        "Ich habe akustisch nur Bruchstuecke verstanden. Sag es bitte nochmal langsam oder kuerzer.";
      const now = Date.now();
      appendConversationHistory(
        memory,
        { role: "user", content: trimForMemory(`${username} sagt im Sprachchat: ${transcript}`) },
        { role: "assistant", content: fallbackReply },
      );
      memory.lastReplyAt = now;
      memory.lastReplyByUser.set(userId, now);
      memory.lastTouchedAt = now;

      const textChannel = client.channels.cache.get(session.textChannelId);
      if (textChannel && textChannel.isTextBased()) {
        void textChannel.send(`**${username}:** ${transcript}\n**Bot:** ${fallbackReply}`);
      }

      return fallbackReply;
    }

    const userMessage = `${username} sagt im Sprachchat: ${transcript}`;
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      ...memory.history,
      { role: "user", content: userMessage },
    ];

    const reply = await generateChatCompletionText(messages);
    if (!reply) return null;

    const clippedReply = clipForTts(reply);
    const memoryReply = trimForMemory(reply);
    const now = Date.now();

    appendConversationHistory(
      memory,
      { role: "user", content: trimForMemory(userMessage) },
      { role: "assistant", content: memoryReply },
    );
    memory.lastReplyAt = now;
    memory.lastReplyByUser.set(userId, now);
    memory.lastTouchedAt = now;

    const textChannel = client.channels.cache.get(session.textChannelId);
    if (textChannel && textChannel.isTextBased()) {
      void textChannel.send(`**${username}:** ${transcript}\n**Bot:** ${memoryReply}`);
    }

    return clippedReply;
  } catch (error) {
    log(`[${session.guildId}] Chat error`, error);
    return null;
  }
}

function clipForTts(text) {
  const singleLine = normalizeTranscriptText(text);
  if (singleLine.length <= MAX_TTS_CHARS) return singleLine;

  const window = singleLine.slice(0, MAX_TTS_CHARS);
  const minBoundaryIndex = Math.max(0, MAX_TTS_CHARS - 120);
  const sentenceBoundary = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
  );

  if (sentenceBoundary >= minBoundaryIndex) {
    return window.slice(0, sentenceBoundary + 1).trim();
  }

  return `${window.slice(0, Math.max(0, MAX_TTS_CHARS - 3)).trim()}...`;
}

async function speakReply(session, text) {
  try {
    const audioBuffer = await synthesizeSpeech(text);
    const resource = createAudioResource(Readable.from([audioBuffer]), {
      inputType: StreamType.Arbitrary,
    });

    session.player.play(resource);
    await entersState(session.player, AudioPlayerStatus.Playing, 15_000);
    await entersState(session.player, AudioPlayerStatus.Idle, 90_000);
  } catch (error) {
    log(`[${session.guildId}] TTS/playback error`, error);

    const textChannel = client.channels.cache.get(session.textChannelId);
    const now = Date.now();
    const shouldNotify =
      now - (session.memory?.lastTtsErrorNotifyAt || 0) >= TTS_ERROR_NOTIFY_COOLDOWN_MS;

    if (textChannel && textChannel.isTextBased() && shouldNotify) {
      session.memory.lastTtsErrorNotifyAt = now;
      void textChannel.send(
        `Sprachausgabe fehlgeschlagen. Ich schreibe weiter im Chat. Ursache: ${String(
          error?.message || error,
        ).slice(0, 180)}`,
      );
    }
  }
}

async function synthesizeSpeech(text) {
  if (TTS_PROVIDER === "elevenlabs") {
    if (!ELEVENLABS_API_KEY) {
      log("ElevenLabs-Key fehlt, nutze Google-TTS-Fallback.");
      return synthesizeWithGoogle(text);
    }

    try {
      return await synthesizeWithElevenLabs(text);
    } catch (error) {
      log("ElevenLabs TTS fehlgeschlagen, nutze Google-TTS-Fallback.", error);
      return synthesizeWithGoogle(text);
    }
  }

  return synthesizeWithGoogle(text);
}

async function synthesizeWithGoogle(text) {
  const cleanText = normalizeTranscriptText(text);
  const commonOptions = {
    lang: GOOGLE_TTS_LANGUAGE,
    slow: false,
    host: "https://translate.google.com",
  };

  if (cleanText.length < 200) {
    const url = googleTTS.getAudioUrl(cleanText, commonOptions);
    const response = await request(url);
    if (response.statusCode >= 400) {
      throw new Error(`Google TTS request failed: HTTP ${response.statusCode}`);
    }
    return Buffer.from(await response.body.arrayBuffer());
  }

  // google-tts-api limitiert getAudioUrl() auf <200 Zeichen.
  const chunks = googleTTS.getAllAudioUrls(cleanText, {
    ...commonOptions,
    splitPunct: ".,!?;:，。！？；：",
  });

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("Google TTS konnte keine Audio-Chunks erzeugen.");
  }

  const buffers = [];
  for (const chunk of chunks) {
    const response = await request(chunk.url);
    if (response.statusCode >= 400) {
      throw new Error(`Google TTS chunk request failed: HTTP ${response.statusCode}`);
    }
    buffers.push(Buffer.from(await response.body.arrayBuffer()));
  }

  return Buffer.concat(buffers);
}

async function synthesizeWithElevenLabs(text) {
  const baseUrl = ELEVENLABS_BASE_URL.replace(/\/+$/, "");
  const url =
    `${baseUrl}/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}` +
    "?output_format=mp3_44100_128";
  const voiceSettings = resolveElevenLabsVoiceSettings();

  const payload = {
    text,
    model_id: ELEVENLABS_MODEL_ID,
    voice_settings: voiceSettings,
  };

  // Nur setzen, wenn ein einfacher Sprachcode genutzt wird (z. B. "de", "en").
  if (/^[a-z]{2}(-[A-Z]{2})?$/i.test(BOT_LANGUAGE)) {
    payload.language_code = STT_LANGUAGE;
  }

  const response = await request(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify(payload),
  });

  if (response.statusCode >= 400) {
    let details = "";
    try {
      details = String(await response.body.text());
    } catch {
      // ignore parse errors
    }
    throw new Error(
      `ElevenLabs TTS request failed: HTTP ${response.statusCode}${details ? ` - ${details}` : ""}`,
    );
  }

  return Buffer.from(await response.body.arrayBuffer());
}

async function joinForMessage(message) {
  const voiceChannel = getMemberVoiceChannel(message);
  if (!voiceChannel) {
    await message.reply("Du musst in einem Voice-Channel sein.");
    return;
  }

  const guildId = message.guild.id;
  const existing = sessions.get(guildId);

  if (existing) {
    existing.textChannelId = message.channel.id;
    if (existing.voiceChannelId === voiceChannel.id) {
      await message.reply("Ich bin bereits in deinem Voice-Channel und hoere zu.");
      return;
    }
    await destroySession(guildId);
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: message.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    const session = createSession(guildId, connection, message.channel.id, voiceChannel.id);
    sessions.set(guildId, session);

    await message.reply(
      `Voice-Channel gejoint: **${voiceChannel.name}**. Ich hoere zu und antworte per Sprache.`,
    );
  } catch (error) {
    connection.destroy();
    log(`[${guildId}] Failed to join voice`, error);
    await message.reply("Konnte dem Voice-Channel nicht beitreten.");
  }
}

async function destroySession(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;

  session.destroyed = true;
  sessions.delete(guildId);

  try {
    session.player.stop(true);
  } catch {
    // ignore
  }

  try {
    session.connection.destroy();
  } catch {
    // ignore
  }
}

async function handleSayCommand(message, text) {
  const session = sessions.get(message.guild.id);
  if (!session) {
    await message.reply("Ich bin noch in keinem Voice-Channel. Nutze zuerst `!join`.");
    return;
  }

  const clipped = clipForTts(text || "Hallo.");
  await enqueueSessionWork(session, async () => {
    await speakReply(session, clipped);
  });
  await message.reply(`Spreche: "${clipped}"`);
}

client.once("ready", async () => {
  await ensureRecordingsDir();
  log(`Bot online als ${client.user.tag}`);
  log(`Prefix: ${PREFIX}`);
  log(
    `LLM Provider: ${LLM_PROVIDER}${
      LLM_PROVIDER === "groq"
        ? ` (model=${GROQ_CHAT_MODEL})`
        : ` (model=${VERTEX_MODEL}, location=${VERTEX_PROJECT_ID ? VERTEX_LOCATION : "express"})`
    }`,
  );
  log(
    `TTS Provider: ${TTS_PROVIDER}${
      TTS_PROVIDER === "elevenlabs"
        ? ` (voice=${ELEVENLABS_VOICE_ID}, preset=${ELEVENLABS_VOICE_PRESET})`
        : ""
    }`,
  );
  log(`Sprache: STT=${STT_LANGUAGE}, TTS=${GOOGLE_TTS_LANGUAGE}/${BOT_LANGUAGE}`);
  log(
    `Reply-Filter: global=${GLOBAL_REPLY_COOLDOWN_MS}ms user=${USER_REPLY_COOLDOWN_MS}ms echo=${BOT_ECHO_GUARD_MS}ms dup=${DUPLICATE_TRANSCRIPT_WINDOW_MS}ms`,
  );
  log(`Memory: messages=${MEMORY_MAX_MESSAGES}, chars=${MEMORY_MAX_CHARS}, TTS max chars=${MAX_TTS_CHARS}`);
  log(
    `Auto-Join Voice: ${AUTO_JOIN_VOICE_CHANNELS ? "aktiv" : "deaktiviert"} (leave cooldown=${AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS}ms)`,
  );

  if (AUTO_JOIN_VOICE_CHANNELS) {
    for (const guild of client.guilds.cache.values()) {
      enqueueAutoJoinReconcile(guild, "startup");
    }
  }
});

client.on("voiceStateUpdate", (oldState, newState) => {
  if (!AUTO_JOIN_VOICE_CHANNELS) return;

  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const member = newState.member || oldState.member;
  if (member?.user?.bot) return;

  enqueueAutoJoinReconcile(guild, "voice-state-update");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const [rawCommand, ...rest] = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (rawCommand || "").toLowerCase();
  const argText = rest.join(" ").trim();

  try {
    if (command === "join") {
      await joinForMessage(message);
      return;
    }

    if (command === "leave") {
      if (AUTO_JOIN_VOICE_CHANNELS) {
        setAutoJoinCooldown(message.guild.id, AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS);
      }
      await destroySession(message.guild.id);
      await message.reply(
        AUTO_JOIN_VOICE_CHANNELS
          ? `Voice-Channel verlassen. Auto-Join pausiert fuer ${Math.round(
              AUTO_JOIN_MANUAL_LEAVE_COOLDOWN_MS / 1000,
            )}s.`
          : "Voice-Channel verlassen.",
      );
      return;
    }

    if (command === "say") {
      await handleSayCommand(message, argText);
      return;
    }

    if (command === "help") {
      await message.reply(
        [
          `**Befehle (${PREFIX})**`,
          `${PREFIX}join - Voice-Channel joinen und zuhoeren`,
          `${PREFIX}leave - Voice-Channel verlassen`,
          `${PREFIX}say <text> - Test-Sprachausgabe`,
          `Auto-Join: ${AUTO_JOIN_VOICE_CHANNELS ? "aktiv" : "deaktiviert"} (joint Voice-Channels mit Nutzern automatisch)`,
          `${PREFIX}help - Hilfe`,
        ].join("\n"),
      );
      return;
    }
  } catch (error) {
    log("Command error", error);
    await message.reply("Fehler beim Ausfuehren des Befehls.");
  }
});

client.on("error", (error) => {
  log("Discord client error", error);
});

process.on("SIGINT", async () => {
  for (const guildId of [...sessions.keys()]) {
    await destroySession(guildId);
  }
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
