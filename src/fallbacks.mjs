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
  "You flapped so hard the bird forgot how to stay up.",
  "Impressive commitment to the floor.",
];

export function randomFallback() {
  return FALLBACK_ROASTS[Math.floor(Math.random() * FALLBACK_ROASTS.length)];
}
