"use client";
import { UserX } from "lucide-react";
import { avatarUrl } from "@/lib/avatar";
import { useChatPhoto } from "@/lib/chatPhotos";

/** Stands in for a player who deleted their username: the name may be someone else's now. */
export function DeletedAvatar({ size = 40, rounded = "rounded-xl", className = "" }) {
  return (
    <span role="img" aria-label="Deleted account" style={{ width: size, height: size }} className={`shrink-0 flex items-center justify-center bg-white/10 text-white/45 ${rounded} ${className}`}>
      <UserX size={Math.round(size / 2)} />
    </span>
  );
}

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
