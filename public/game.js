const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const hud = document.getElementById("hud");

const GRAVITY = 0.25;
const FLAP_IMPULSE = -4.5;
const PIPE_WIDTH = 60;
const PIPE_GAP = 140;
const PIPE_SPEED = 2;
const PIPE_SPAWN_INTERVAL = 120;

let bird, pipes, score, frames, gameState, flapCount;

function initGame() {
  bird = { x: 80, y: canvas.height / 2, vy: 0, r: 12 };
  pipes = [];
  score = 0;
  frames = 0;
  flapCount = 0;
  gameState = "ready";
  overlay.classList.add("hidden");
}

function flap() {
  if (gameState === "ready" || gameState === "playing") {
    if (gameState === "ready") gameState = "playing";
    bird.vy = FLAP_IMPULSE;
    flapCount++;
  } else if (gameState === "over") {
    initGame();
    gameState = "ready";
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); flap(); }
});
canvas.addEventListener("mousedown", flap);
canvas.addEventListener("touchstart", (e) => { e.preventDefault(); flap(); }, { passive: false });

function update() {
  frames++;
  bird.vy += GRAVITY;
  bird.y += bird.vy;

  if (bird.y - bird.r <= 0) return die("ceiling");
  if (bird.y + bird.r >= canvas.height) return die("ground");

  if (frames % PIPE_SPAWN_INTERVAL === 0) {
    const gapY = 60 + Math.random() * (canvas.height - PIPE_GAP - 120);
    pipes.push({ x: canvas.width, y: gapY, passed: false });
  }

  for (let i = pipes.length - 1; i >= 0; i--) {
    const p = pipes[i];
    p.x -= PIPE_SPEED;

    if (!p.passed && bird.x > p.x + PIPE_WIDTH) {
      p.passed = true;
      score++;
    }

    if (bird.x + bird.r > p.x && bird.x - bird.r < p.x + PIPE_WIDTH) {
      if (bird.y - bird.r < p.y || bird.y + bird.r > p.y + PIPE_GAP) {
        return die("pipe", i + 1);
      }
    }

    if (p.x + PIPE_WIDTH < 0) pipes.splice(i, 1);
  }
}

async function die(cause, pipeNumber = null) {
  gameState = "over";
  const flightMs = Math.floor((frames / 60) * 1000);

  overlay.classList.remove("hidden");
  overlay.innerHTML = `
    <h2>Game Over</h2>
    <div class="score">Score: ${score} · Flight: ${(flightMs / 1000).toFixed(1)}s</div>
    <div class="roast">Roasting...</div>
    <div class="hint">Press Space to restart</div>
  `;

  try {
    const res = await fetch("/api/roast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cause, pipeNumber, score, flightMs, flaps: flapCount }),
    });
    const data = await res.json();
    overlay.innerHTML = `
      <h2>Game Over</h2>
      <div class="score">Score: ${score} · Flight: ${(flightMs / 1000).toFixed(1)}s</div>
      <div class="roast">"${data.roast}"</div>
      <div class="hint">Press Space to restart</div>
    `;
  } catch (err) {
    overlay.querySelector(".roast").textContent = "(Roast server unreachable.)";
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#228B22";
  for (const p of pipes) {
    ctx.fillRect(p.x, 0, PIPE_WIDTH, p.y);
    ctx.fillRect(p.x, p.y + PIPE_GAP, PIPE_WIDTH, canvas.height - (p.y + PIPE_GAP));
  }

  ctx.beginPath();
  ctx.arc(bird.x, bird.y, bird.r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd166";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#222";
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 26px -apple-system, sans-serif";
  ctx.fillText(String(score), 16, 42);
}

function loop() {
  if (gameState === "playing") update();
  draw();
  requestAnimationFrame(loop);
}

async function pollStatus() {
  try {
    const r = await fetch("/api/status");
    const s = await r.json();
    if (s.modelState === "ready") hud.textContent = "";
    else hud.textContent = `model: ${s.modelState} ${s.progress ? Math.round(s.progress) + "%" : ""}`;
  } catch { hud.textContent = ""; }
}

initGame();
loop();
setInterval(pollStatus, 1500);
