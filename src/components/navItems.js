import { BookOpen, CircleHelp, History, Home, Info, Megaphone, MessageCircle, Settings, Wallet } from "lucide-react";

// The app's pages in menu order: the desktop sidebar and the phone menu drawer.
export const NAV_ITEMS = [
  { name: "Home", icon: Home, path: "/dashboard" },
  { name: "Chats", icon: MessageCircle, path: "/chat" },
  { name: "History", icon: History, path: "/history" },
  { name: "Deposit", icon: Wallet, path: "/deposit" },
  { name: "Blog Post", icon: BookOpen, path: "/blog" },
  { name: "FAQ", icon: CircleHelp, path: "/faq" },
  { name: "Contact Support", icon: MessageCircle, path: "/support" },
  { name: "Advertise with Us", icon: Megaphone, path: "/advertise" },
  { name: "About Us", icon: Info, path: "/about" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

// /blog and /chat have sub-pages (/blog/<slug>, /chat/room…) that keep their item highlighted.
export const isNavActive = (pathname, path) =>
  path === "/blog" || path === "/chat" ? pathname === path || pathname.startsWith(`${path}/`) : pathname === path;
