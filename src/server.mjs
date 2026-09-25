import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadModel,
  completion,
  textToSpeech,
  unloadModel,
  LLAMA_3_2_1B_INST_Q4_0,
  TTS_EN_SUPERTONIC_Q4_0,
} from "@qvac/sdk";
import {
  registerDeath,
  getAttemptNumber,
  getEscalationTier,
  buildRoastPrompt,
  rememberRoast,
  getRecentRoasts,
} from "./roast-engine.mjs";
import { randomFallback, randomTip } from "./fallbacks.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = 3000;

let llmId = null;
let ttsId = null;
let llmState = "unloaded";
let ttsState = "unloaded";
let llmProgress = 0;
let ttsProgress = 0;
let roastSeed = 0;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
    req.on("error", reject);
  });
}

async function resolveMaybe(value) {
  if (value == null) return value;
  if (typeof value.then === "function") return await value;
  return value;
}

function chunkToString(chunk) {
  if (chunk == null) return "";
  if (typeof chunk === "string") return chunk;
  if (typeof chunk === "object") {
    if (typeof chunk.text === "string") return chunk.text;
    if (typeof chunk.content === "string") return chunk.content;
    if (typeof chunk.delta === "string") return chunk.delta;
    if (typeof chunk.token === "string") return chunk.token;
    if (typeof chunk.value === "string") return chunk.value;
  }
  return "";
}

async function extractText(result) {
  if (result == null) return "";
  if (typeof result === "string") return result;
  const candidates = ["text", "final", "content", "output", "response", "message", "choices", "delta"];
  for (const key of candidates) {
    let v = result[key];
    if (v == null) continue;
    v = await resolveMaybe(v);
    if (typeof v === "string") return v;
    if (v && typeof v[Symbol.asyncIterator] === "function") {
      let out = "";
      for await (const chunk of v) out += chunkToString(await resolveMaybe(chunk));
      if (out) return out;
      continue;
    }
    if (v && typeof v[Symbol.iterator] === "function" && typeof v !== "string") {
      let out = "";
      for (const chunk of v) out += chunkToString(chunk);
      if (out) return out;
      continue;
    }
    if (typeof v === "object") {
      const nested = await extractText(v);
      if (nested) return nested;
    }
  }
  return "";
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}
function jaccard(a, b) {
  const A = new Set(a.split(" "));
  const B = new Set(b.split(" "));
  const inter = [...A].filter((w) => B.has(w)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : inter / union;
}
function isDuplicate(candidate, recent) {
  const c = normalize(candidate);
  if (!c) return true;
  for (const r of recent) {
    const rn = normalize(r);
    if (rn === c) return true;
    if (jaccard(c, rn) > 0.7) return true;
  }
  return false;
}
function cleanRoast(s) {
  let t = String(s || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || "";
  t = t.replace(/^\s*(roast|line\s*\d|\d+[.):])\s*[:.\-]?\s*/i, "");
  t = t.replace(/^["'""'']+|["'""'']+$/g, "");
  return t.replace(/\s+/g, " ").trim();
}
function isValidRoast(text, recent) {
  if (!text) return false;
  const words = text.trim().split(/\s+/);
  if (words.length < 5 || words.length > 18) return false;
  if (text.length > 140) return false;
  if (!/\d/.test(text)) return false;
  if (/[:;]/.test(text)) return false;
  if (isDuplicate(text, recent)) return false;
  const unitPairs = [["second","seconds"], ["pipe","pipes"], ["flap","flaps"]];
  const lower = text.toLowerCase();
  for (const [sing, plur] of unitPairs) {
    const re = new RegExp("\\b(" + sing + "|" + plur + ")\\b", "g");
    if ((lower.match(re) || []).length > 1) return false;
  }
  return true;
}

// PCM (mono, 16-bit) -> WAV buffer
function pcmToWav(pcm, rate) {
  const n = pcm.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  return buf;
}

async function synthesizeSpeech(text) {
  if (!ttsId) return null;
  try {
    const result = await textToSpeech({
      modelId: ttsId,
      text,
      stream: false,
    });
    const samples = await result.buffer;
    if (!Array.isArray(samples) || samples.length === 0) return null;
    return pcmToWav(samples, 44100).toString("base64");
  } catch (err) {
    console.error("[tts] synth error:", err.message);
    return null;
  }
}

async function initializeModels() {
  // LLM first
  llmState = "downloading";
  console.log("[qvac] Loading LLM...");
  try {
    llmId = await loadModel({
      modelSrc: LLAMA_3_2_1B_INST_Q4_0,
      onProgress: (p) => {
        llmProgress = p.percentage ?? 0;
        llmState = p.percentage < 100 ? "downloading" : "loading";
      },
    });
    llmState = "ready";
    console.log("[qvac] LLM ready.");
  } catch (err) {
    console.error("[qvac] LLM failed:", err);
    llmState = "unloaded";
  }

  // TTS second
  ttsState = "downloading";
  console.log("[qvac] Loading TTS...");
  try {
    ttsId = await loadModel({
      modelSrc: TTS_EN_SUPERTONIC_Q4_0,
      modelType: "tts-ggml",
      modelConfig: { ttsEngine: "supertonic", language: "en", voice: "F1" },
      onProgress: (p) => {
        ttsProgress = p.percentage ?? 0;
        ttsState = p.percentage < 100 ? "downloading" : "loading";
      },
    });
    ttsState = "ready";
    console.log("[qvac] TTS ready.");
  } catch (err) {
    console.error("[qvac] TTS failed:", err);
    ttsState = "unloaded";
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  if (req.method === "GET" && url !== "/api/status") {
    let rel = url === "/" ? "/index.html" : url;
    const filePath = path.join(PUBLIC_DIR, rel);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403); return res.end("Forbidden");
    }
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "text/plain" });
      res.end(data);
    });
    return;
  }

  if (req.method === "GET" && url === "/api/status") {
    return json(res, 200, {
      modelState: llmState,
      progress: llmProgress,
      ttsState,
      ttsProgress,
    });
  }

  if (req.method === "POST" && url === "/api/roast") {
    let deathContext;
    try {
      deathContext = JSON.parse(await readBody(req));
    } catch {
      return json(res, 400, { error: "invalid json" });
    }

    registerDeath(deathContext);
    const attempt = getAttemptNumber();
    const tier = getEscalationTier(deathContext.score, attempt);
    const recentRoasts = getRecentRoasts();
    const tip = randomTip();

    // Fallback path when LLM isn't ready
    if (llmState !== "ready" || !llmId) {
      const roast = randomFallback();
      rememberRoast(roast);
      const audio = await synthesizeSpeech(roast);
      return json(res, 202, { roast, tip, audio, tier, attempt, fallback: true });
    }

    // Generate the roast text
    let roast;
    let fromAI = false;
    try {
      roastSeed++;
      const history = buildRoastPrompt(deathContext, attempt, tier, roastSeed);
      const result = await completion({
        modelId: llmId,
        history,
        temperature: 0.7,
        maxTokens: 28,
      });
      const candidate = cleanRoast(await extractText(result));
      if (isValidRoast(candidate, recentRoasts)) {
        roast = candidate;
        fromAI = true;
      } else {
        console.log(`[roast rejected] "${candidate}"`);
        roast = randomFallback();
      }
    } catch (err) {
      console.error("[roast error]", err.message);
      roast = randomFallback();
    }

    rememberRoast(roast);

    // Synthesize the roast to audio
    const audio = await synthesizeSpeech(roast);

    console.log(`[roast t${tier} a${attempt}] ${fromAI ? "ai" : "fb"} | audio: ${audio ? "yes" : "no"}`);
    console.log(`  roast: ${roast}`);
    console.log(`  tip:   ${tip}`);

    return json(res, 200, {
      roast, tip, audio,
      tier, attempt,
      fallback: fromAI ? false : "roast",
    });
  }

  res.writeHead(404); res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n🦅  The Roast Bird → http://localhost:${PORT}\n`);
  initializeModels();
});

process.on("SIGINT", async () => {
  console.log("\n[shutdown] unloading models...");
  if (llmId) { try { await unloadModel({ modelId: llmId }); } catch {} }
  if (ttsId) { try { await unloadModel({ modelId: ttsId }); } catch {} }
  process.exit(0);
});
