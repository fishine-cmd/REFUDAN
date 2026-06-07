import type { ReactNode } from "react";

export default function MeLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}
