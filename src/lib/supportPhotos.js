// Photos in Live Support. /api/support keeps each one in support_chats/{uid}/support_images/{id}
// (a JPEG data URL: there's no Storage bucket) and adds a message with its imageId to the
// chat; the photo itself is read back through the same route.

export const SUPPORT_PHOTO_MAX_CHARS = 400000; // the server's limit, about 300 KB of JPEG
export const SUPPORT_PHOTO_LABEL = "📷 Photo"; // the chat's last message for a photo without a caption

const SIDES = [1280, 1024, 800]; // px, the longer side
const QUALITIES = [0.82, 0.7, 0.58, 0.46];

/** An image file scaled to fit SIDES[0], as a JPEG data URL small enough to send. */
export async function supportJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image we can read."));
      i.src = url;
    });
    for (const side of SIDES) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#fff"; // transparent PNGs get a white background, not black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of QUALITIES) {
        const data = canvas.toDataURL("image/jpeg", quality);
        if (data.startsWith("data:image/jpeg") && data.length <= SUPPORT_PHOTO_MAX_CHARS) return data;
      }
    }
    throw new Error("Could not make that photo small enough.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
