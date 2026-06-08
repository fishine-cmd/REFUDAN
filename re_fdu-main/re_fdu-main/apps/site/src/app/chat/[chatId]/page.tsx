"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { surfaceNames } from "@/lib/product-language";

export default function LegacyChatRedirectPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/a2a/${chatId}?from=legacy-chat`);
  }, [chatId, router]);

  return (
    <main className="chat-room-shell">
      <p>正在跳转到新的{surfaceNames.sessionCenter}...</p>
    </main>
  );
}
