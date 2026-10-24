import { avatarUrl } from "@/lib/avatar";

/** A player's pixel-art avatar, generated from their username. */
export default function Avatar({ username, size = 40, rounded = "rounded-xl", className = "" }) {
  return (
    // A small SVG from DiceBear: next/image would only add a loader round trip.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl(username)}
      alt={username ? `@${username}` : ""}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      className={`shrink-0 bg-[#142036] ${rounded} ${className}`}
    />
  );
}
