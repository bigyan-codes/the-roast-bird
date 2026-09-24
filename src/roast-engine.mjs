const session = {
  attempts: [],
  best: 0,
  deathsByCause: { pipe: 0, ground: 0, ceiling: 0 },
  recentRoasts: [],
};

export function registerDeath(deathContext) {
  session.attempts.push(deathContext);
  session.deathsByCause[deathContext.cause] =
    (session.deathsByCause[deathContext.cause] || 0) + 1;
  if (deathContext.score > session.best) session.best = deathContext.score;
}

export function getAttemptNumber() {
  return session.attempts.length;
}

export function getSessionBest() {
  return session.best;
}

export function getRecentRoasts() {
  return session.recentRoasts;
}

export function getEscalationTier(score, attempt) {
  if (attempt === 1 && score === 0) return 0;
  if (score >= 20) return 4;
  if (score >= 10) return 3;
  if (score >= 4) return 2;
  return 1;
}

const TIER_TONE = {
  0: "deadpan",
  1: "mocking",
  2: "concerned",
  3: "begrudging",
  4: "suspicious",
};

export function buildRoastPrompt(deathContext, attempt, tier, seed) {
  const recent = session.recentRoasts.length
    ? `\nDo NOT reuse the phrasing of these recent roasts:\n${session.recentRoasts.slice(-4).map((r) => `- ${r}`).join("\n")}`
    : "";

  const system = `You write ONE short roast line for a Flappy Bird player who just died. Deadpan, mean, funny. One sentence. No emoji, no quotes, no labels, no coaching.${recent}`;

  const angles = [
    "the low score",
    "how fast they died",
    "the pipes winning again",
    "gravity doing its job",
    "the bird's wasted effort",
    "their technique (or lack of it)",
  ];
  const angle = angles[seed % angles.length];

  const user = `Player stats:
score: ${deathContext.score} pipes
flight: ${(deathContext.flightMs / 1000).toFixed(1)} seconds
flaps: ${deathContext.flaps}
died by: ${deathContext.cause}${deathContext.pipeNumber ? ` #${deathContext.pipeNumber}` : ""}

Write ONE roast line (max 14 words). Cite exactly ONE of the numbers above. Focus on: ${angle}. Tone: ${TIER_TONE[tier]}.

Roast:`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function rememberRoast(roast) {
  session.recentRoasts.push(roast);
  if (session.recentRoasts.length > 5) session.recentRoasts.shift();
}
