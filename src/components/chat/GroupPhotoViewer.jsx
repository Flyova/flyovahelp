"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { groupPhotoUrl } from "@/lib/groupPhotos";

/**
 * A group's photo full screen, for any member (the big copy when the group has one,
 * shown over the small one while it loads). Tap anywhere or press Escape to close.
 */
export default function GroupPhotoViewer({ convo, onClose }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="chat-backdrop fixed inset-0 z-[350] bg-[#060b14]/95 backdrop-blur-sm flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={`${convo.groupName || "Group"} photo`} onClick={onClose}>
      <button type="button" aria-label="Close" className="absolute right-4 top-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"><X size={20} /></button>
      <div className="chat-pop w-[min(94vw,640px)]">
        <div className="relative w-full aspect-square rounded-3xl overflow-hidden bg-[#142036]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={groupPhotoUrl(convo.id, convo.photoVersion)} alt="" className="absolute inset-0 w-full h-full object-cover" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={groupPhotoUrl(convo.id, convo.photoVersion, true)}
            alt={`${convo.groupName || "Group"} photo`}
            onLoad={() => setLoaded(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        </div>
        <p className="mt-3 text-center font-black break-words">{convo.groupName}</p>
      </div>
    </div>,
    document.body
  );
}
