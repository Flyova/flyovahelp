// Every player gets a pixel-art DiceBear avatar drawn from their username, so
// there is nothing to upload: the same name always gives the same character.
// Backgrounds use the brand's navy, blue and maroon.
const STYLE = "pixel-art";
const BACKGROUNDS = "142036,2457d6,8b1e3f";

export function avatarUrl(username) {
  const seed = String(username || "player").trim().replace(/^@/, "").toLowerCase();
  return `https://api.dicebear.com/9.x/${STYLE}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${BACKGROUNDS}&backgroundType=solid`;
}
