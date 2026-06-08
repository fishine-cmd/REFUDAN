"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { surfaceNames } from "@/lib/product-language";

export default function LegacyNewChatRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(`/a2a/new${query ? `?${query}` : ""}`);
  }, [router, searchParams]);

  return (
    <main className="chat-compose-shell">
      <p>正在跳转到新的{surfaceNames.launchPad}...</p>
    </main>
  );
}
