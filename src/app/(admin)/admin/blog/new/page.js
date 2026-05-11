"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, collection } from "firebase/firestore";
import { Loader2 } from "lucide-react";

// Generates a new Firestore doc ID and redirects to the editor
export default function NewBlogPost() {
  const router = useRouter();
  useEffect(() => {
    const newRef = doc(collection(db, "blog_posts"));
    router.replace(`/admin/blog/${newRef.id}?new=1`);
  }, [router]);
  return (
    <div className="flex items-center justify-center h-96">
      <Loader2 size={24} className="animate-spin text-[#613de6]" />
    </div>
  );
}
