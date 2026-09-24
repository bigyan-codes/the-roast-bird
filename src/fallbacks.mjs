export const FALLBACK_ROASTS = [
  "Zero pipes. The first one didn't even have to try.",
  "The bird flew like it owed gravity money.",
  "You flapped with the confidence of someone who has never flapped before.",
  "That pipe was standing still. You were not.",
  "A performance best described as 'brief'.",
  "Gravity: 1. You: 0. Again.",
  "Even the ceiling rejected you.",
  "The bird has filed a complaint with HR.",
  "You call that flying? The bird calls it falling with extra steps.",
  "Your best skill is finding new ways to hit pipes.",
  "Somewhere, a pigeon is embarrassed for you.",
  "The ground was the only thing that wanted you.",
  "That wasn't a flight, that was a short story.",
  "Impressive commitment to the floor.",
  "The pipes didn't move. You did. Into them.",
];

export const FALLBACK_TIPS = [
  "Single flaps beat double flaps in tight gaps.",
  "Aim for the middle of the gap, not the top edge.",
  "Flap earlier — the bird falls faster than you think at the top.",
  "Keep a steady rhythm; panic flapping always ends badly.",
  "Don't flap into the pipe — flap before it arrives.",
  "Watch the gap, not the bird. The bird follows your input.",
  "Two quick taps beat one long hold every time.",
  "Pre-flap before a close pipe reaches you.",
  "Stay in the middle third. Don't chase the ceiling.",
  "The first pipe sets your rhythm — get it clean.",
  "Stop flapping when you're through. Momentum carries you.",
  "If you're falling fast, flap once and wait. Don't spam.",
  "If you're nose-down, you're too late. Flap earlier.",
  "Every pipe is a fresh decision. Don't reuse the last gap's timing.",
  "Your biggest issue is timing, not speed. Slow down.",
];

export function randomFallback() {
  return FALLBACK_ROASTS[Math.floor(Math.random() * FALLBACK_ROASTS.length)];
}

export function randomTip() {
  return FALLBACK_TIPS[Math.floor(Math.random() * FALLBACK_TIPS.length)];
}
