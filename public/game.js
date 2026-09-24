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

let bird, pipes, score, frames, gameState, flapCount, groundOffset;

function initGame() {
  bird = { x: 80, y: canvas.height / 2, vy: 0, r: 13 };
  pipes = [];
  score = 0;
  frames = 0;
  flapCount = 0;
  groundOffset = 0;
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
  groundOffset = (groundOffset + PIPE_SPEED) % 24;

  if (bird.y - bird.r <= 0) return die("ceiling");
  if (bird.y + bird.r >= canvas.height - 60) return die("ground");

  if (frames % PIPE_SPAWN_INTERVAL === 0) {
    const gapY = 60 + Math.random() * (canvas.height - PIPE_GAP - 160);
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

// ---------- Drawing ----------

function drawBackground() {
  // Sky gradient
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, "#70c5ce");
  g.addColorStop(1, "#a8e6cf");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Distant clouds
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  const clouds = [
    { x: (frames * 0.3) % (canvas.width + 120) - 60, y: 90, s: 26 },
    { x: (frames * 0.2 + 180) % (canvas.width + 160) - 80, y: 150, s: 20 },
    { x: (frames * 0.4 + 90) % (canvas.width + 140) - 70, y: 60, s: 16 },
  ];
  for (const c of clouds) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.s, 0, Math.PI * 2);
    ctx.arc(c.x + c.s * 0.9, c.y + 4, c.s * 0.75, 0, Math.PI * 2);
    ctx.arc(c.x - c.s * 0.9, c.y + 4, c.s * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground strip
  ctx.fillStyle = "#ded895";
  ctx.fillRect(0, canvas.height - 60, canvas.width, 60);
  ctx.fillStyle = "#c9c26b";
  for (let x = -groundOffset; x < canvas.width; x += 24) {
    ctx.fillRect(x, canvas.height - 60, 12, 8);
  }
  ctx.fillStyle = "#7ec850";
  ctx.fillRect(0, canvas.height - 60, canvas.width, 6);
}

function drawPipe(p) {
  const bodyGrad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_WIDTH, 0);
  bodyGrad.addColorStop(0, "#4caf50");
  bodyGrad.addColorStop(0.5, "#8bd17c");
  bodyGrad.addColorStop(1, "#2e7d32");

  // Top pipe body
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(p.x, 0, PIPE_WIDTH, p.y - 22);
  // Top pipe cap
  ctx.fillRect(p.x - 4, p.y - 22, PIPE_WIDTH + 8, 22);
  ctx.strokeStyle = "#1b5e20";
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x - 4, p.y - 22, PIPE_WIDTH + 8, 22);

  // Bottom pipe body
  const bottomY = p.y + PIPE_GAP;
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(p.x, bottomY + 22, PIPE_WIDTH, canvas.height - bottomY);
  // Bottom pipe cap
  ctx.fillRect(p.x - 4, bottomY, PIPE_WIDTH + 8, 22);
  ctx.strokeRect(p.x - 4, bottomY, PIPE_WIDTH + 8, 22);
}

function drawBird() {
  const angle = Math.max(-0.4, Math.min(1.2, bird.vy * 0.06));
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(angle);

  // Body
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd166";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#6b4a00";
  ctx.stroke();

  // Belly (lighter)
  ctx.beginPath();
  ctx.ellipse(-1, 4, 10, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffeaa7";
  ctx.fill();

  // Wing — flaps when velocity is negative
  const wingY = bird.vy < 0 ? -4 : 3;
  ctx.beginPath();
  ctx.ellipse(-4, wingY, 7, 4, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = "#f5b400";
  ctx.fill();
  ctx.strokeStyle = "#6b4a00";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Eye
  ctx.beginPath();
  ctx.arc(6, -3, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(7, -3, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();

  // Beak (triangle)
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(24, 2);
  ctx.lineTo(14, 5);
  ctx.closePath();
  ctx.fillStyle = "#ff8c42";
  ctx.fill();
  ctx.strokeStyle = "#a34400";
  ctx.stroke();

  ctx.restore();
}

function draw() {
  drawBackground();

  for (const p of pipes) drawPipe(p);

  drawBird();

  // Score at top-left
  ctx.save();
  ctx.font = "bold 34px -apple-system, sans-serif";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.strokeText(String(score), 18, 46);
  ctx.fillStyle = "#fff";
  ctx.fillText(String(score), 18, 46);
  ctx.restore();

  // Ready hint
  if (gameState === "ready") {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 50);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Press Space to flap", canvas.width / 2, canvas.height / 2 - 8);
    ctx.textAlign = "left";
  }
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
