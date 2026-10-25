"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CHAT_SECTIONS, LAST_SECTION_KEY } from "@/components/chat/ChatProvider";

/** /chat opens the Chats page you used last (the chatroom the first time). */
export default function ChatIndex() {
  const router = useRouter();

  useEffect(() => {
    // Older links (e.g. push notifications) say /chat?tab=private.
    let section = new URLSearchParams(window.location.search).get("tab");
    if (!section) {
      try {
        section = localStorage.getItem(LAST_SECTION_KEY);
      } catch {
        section = null;
      }
    }
    router.replace(`/chat/${CHAT_SECTIONS.some((s) => s.key === section) ? section : "room"}`);
  }, [router]);

  return null;
}
