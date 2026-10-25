"use client";
import { avatarUrl } from "@/lib/avatar";
import { useChatPhoto } from "@/lib/chatPhotos";

/**
 * A player's avatar: the profile photo they uploaded for this chat username, or
 * else their pixel-art character, generated from the username.
 */
export default function Avatar({ username, size = 40, rounded = "rounded-xl", className = "" }) {
  const photo = useChatPhoto(username);
  return (
    // Small remote images: next/image would only add a loader round trip.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo || avatarUrl(username)}
      alt={username ? `@${username}` : ""}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      style={{ width: size, height: size, ...(photo ? { objectFit: "cover" } : { imageRendering: "pixelated" }) }}
      className={`shrink-0 bg-[#142036] ${rounded} ${className}`}
    />
  );
}
