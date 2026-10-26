// Where a group's photo is served from (see /api/chat/group-photo). `version` is
// the group's photoVersion: 0 means it has no photo.
export const groupPhotoUrl = (groupId, version) =>
  groupId && version ? `/api/chat/group-photo?id=${encodeURIComponent(groupId)}&v=${version}` : "";

const PHOTO_SIZE = 360; // px, square
const MAX_CHARS = 90000; // the server takes up to 100,000

/** A centred square crop of an image file, as a small JPEG data URL. */
export async function squareJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image we can read."));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
    for (const quality of [0.86, 0.76, 0.64, 0.5, 0.38]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.startsWith("data:image/jpeg") && data.length <= MAX_CHARS) return data;
    }
    throw new Error("Could not make that photo small enough.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
