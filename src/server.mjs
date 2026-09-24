import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadModel,
  completion,
  unloadModel,
  LLAMA_3_2_1B_INST_Q4_0,
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

let modelId = null;
let modelState = "unloaded";
let modelProgress = 0;
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

// ---------- Roast parsing + validation (loose but meaningful) ----------

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
  let t = String(s || "")
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || "";
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
  if (/[:;]/.test(text)) return false;         // no jammed-on extra clauses
  if (isDuplicate(text, recent)) return false;

  // Reject garbled unit phrasings like "6 seconds a second"
  const unitPairs = [["second","seconds"], ["pipe","pipes"], ["flap","flaps"]];
  const lower = text.toLowerCase();
  for (const [sing, plur] of unitPairs) {
    const re = new RegExp("\\b(" + sing + "|" + plur + ")\\b", "g");
    const count = (lower.match(re) || []).length;
    if (count > 1) return false;
  }

  return true;
}

// ---------- Model lifecycle ----------

async function initializeModel() {
  if (modelId) return;
  modelState = "downloading";
  console.log("[qvac] Loading model...");
  try {
    modelId = await loadModel({
      modelSrc: LLAMA_3_2_1B_INST_Q4_0,
      onProgress: (p) => {
        modelProgress = p.percentage ?? 0;
        modelState = p.percentage < 100 ? "downloading" : "loading";
      },
    });
    modelState = "ready";
    console.log("[qvac] Model ready.");
  } catch (err) {
    console.error("[qvac] Model failed to load:", err);
    modelState = "unloaded";
  }
}

// ---------- HTTP ----------

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
    return json(res, 200, { modelState, progress: modelProgress });
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
    const tip = randomTip();   // coaching is always curated — always clean

    // Model not ready → both roast and tip from curated
    if (modelState !== "ready" || !modelId) {
      const roast = randomFallback();
      rememberRoast(roast);
      return json(res, 202, { roast, tip, tier, attempt, fallback: true });
    }

    try {
      roastSeed++;
      const history = buildRoastPrompt(deathContext, attempt, tier, roastSeed);
      const result = await completion({
        modelId,
        history,
        temperature: 0.7,
        maxTokens: 28,
      });

      const roast = cleanRoast(await extractText(result));

      if (isValidRoast(roast, recentRoasts)) {
        rememberRoast(roast);
        console.log(`[ok t${tier} a${attempt}] roast:ai`);
        console.log(`  roast: ${roast}`);
        console.log(`  tip:   ${tip}`);
        return json(res, 200, { roast, tip, tier, attempt, fallback: false });
      }

      // Roast failed validation → curated fallback for roast only
      const fb = randomFallback();
      rememberRoast(fb);
      console.log(`[ok t${tier} a${attempt}] roast:fb (rejected: "${roast}")`);
      console.log(`  roast: ${fb}`);
      console.log(`  tip:   ${tip}`);
      return json(res, 200, { roast: fb, tip, tier, attempt, fallback: "roast" });
    } catch (err) {
      console.error("[roast error]", err.message);
      const fb = randomFallback();
      rememberRoast(fb);
      return json(res, 202, { roast: fb, tip, tier, attempt, fallback: "both" });
    }
  }

  res.writeHead(404); res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n🦅  The Roast Bird → http://localhost:${PORT}\n`);
  initializeModel();
});

process.on("SIGINT", async () => {
  console.log("\n[shutdown] unloading model...");
  if (modelId) { try { await unloadModel({ modelId }); } catch {} }
  process.exit(0);
});
