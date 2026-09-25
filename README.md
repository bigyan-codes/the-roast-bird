# 🦅 The Roast Bird

A Flappy Bird clone where a local LLM roasts you, coaches you, and **speaks the roast out loud** after every death — based on exactly how you died. All inference runs on-device via the [QVAC SDK](https://github.com/tetherto/qvac). No API keys, no cloud, no data leaving your machine.

> *"Three pipes and a 4-second run. Impressive, in the wrong direction."*

![The Roast Bird game-over screen](./screenshot.png)

## What it does

Every time you die, the game sends the death context (score, survival time, pipe number, flap count, attempt number) to a local Node.js server. The server runs three on-device AI operations in sequence:

1. **Roast** — QVAC's `completion` function runs Llama 3.2 1B to generate a short, deadpan roast that cites a real stat from the death report.
2. **Coach** — a curated coaching tip is paired with the roast. The 1B model is good at roasting, bad at coaching, so tips come from a hand-written set that stays useful and clean.
3. **Speak** — QVAC's `textToSpeech` function runs Supertonic TTS to speak the roast out loud through the browser.

Roasts escalate in tone as you play — deadpan mockery at first, then grudging respect at higher scores. A server-side validation layer rejects roasts that garble units, repeat recent ones, or run too long, substituting a curated fallback so the game never shows broken output.

## Built with

- **@qvac/sdk v0.20.0** — `loadModel`, `completion`, and `textToSpeech`
- **LLM:** `LLAMA_3_2_1B_INST_Q4_0` (Llama 3.2 1B Instruct, Q4_0 quantized)
- **TTS:** `TTS_EN_SUPERTONIC_Q4_0` (Supertonic English, voice F1)
- Vanilla HTML5 canvas + JS (no build step)
- Node.js >= 22.17

## Prerequisites

- **Node.js >= 22.17** and **npm >= 10.9**
- **4 GB+ RAM** recommended
- **~1.1 GB free disk** for models (LLM ~1 GB + TTS ~80 MB), cached in `~/.qvac/models/` after first run
- **Windows users:** Vulkan >= 1.4 is required even for CPU-only inference

## Install

    git clone https://github.com/bigyan-codes/the-roast-bird.git
    cd the-roast-bird
    npm install

## Run

    npm start

Then open **http://localhost:3000** in your browser.

- **First run:** models download (~1.1 GB total) — progress shown in the top-right HUD. The game is playable during the download using canned fallback roasts.
- **Subsequent runs:** models load from cache in ~1–2 seconds.
- **Controls:** Space / click / tap to flap.
- **Sound:** turn your volume up — the bird speaks the roast after each death.

## Architecture

    Browser (canvas game)  --POST /api/roast-->  Node server (localhost)
                                                 |- session memory (in-RAM)
                                                 |- escalation + prompt builder
                                                 |- roast validation (rejects repeats/garbage)
                                                 |- QVAC SDK (on-device)
                                                    |- loadModel
                                                    |- completion     -> roast text
                                                    \- textToSpeech   -> spoken audio

- `GET /api/status` -> model download/load progress
- `POST /api/roast` -> death context in, roast + tip + base64 WAV audio out

## License

MIT — see [LICENSE](./LICENSE).
