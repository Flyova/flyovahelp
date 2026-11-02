// Where a group's photo is served from (see /api/chat/group-photo). `version` is
// the group's photoVersion: 0 means it has no photo. `large` asks for the copy made
// for viewing it full screen (the small one when there isn't one).
export const groupPhotoUrl = (groupId, version, large = false) =>
  groupId && version ? `/api/chat/group-photo?id=${encodeURIComponent(groupId)}&v=${version}${large ? "&size=large" : ""}` : "";

const PHOTO_SIZE = 360; // px, square
const MAX_CHARS = 90000; // the server takes up to 100,000
const LARGE_SIZES = [1080, 800]; // px, square: the full-screen copy
const MAX_LARGE_CHARS = 650000; // the server takes up to 700,000

function loadImage(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("That file isn't an image we can read."));
    i.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

/** A centred square crop of `img`, `size` px wide, as the best JPEG data URL under `maxChars` (or null). */
function squareData(img, size, maxChars) {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
  for (const quality of [0.86, 0.76, 0.64, 0.5, 0.38]) {
    const data = canvas.toDataURL("image/jpeg", quality);
    if (data.startsWith("data:image/jpeg") && data.length <= maxChars) return data;
  }
  return null;
}

/**
 * The group photo for /api/chat/group-photo, from an image file: a centred square
 * crop as a small JPEG data URL (`photoURL`), and a bigger copy of it for members
 * who open it full screen (`largeURL`, "" if it can't be made small enough).
 */
export async function groupPhotoJpegs(file) {
  const img = await loadImage(file);
  const photoURL = squareData(img, PHOTO_SIZE, MAX_CHARS);
  if (!photoURL) throw new Error("Could not make that photo small enough.");
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  let largeURL = "";
  for (const size of LARGE_SIZES) {
    largeURL = squareData(img, Math.min(size, side), MAX_LARGE_CHARS) || ""; // never blown up past the original
    if (largeURL) break;
  }
  return { photoURL, largeURL };
}
