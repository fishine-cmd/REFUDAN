// /me — 根据 role SSR 重定向,避免客户端闪烁
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function MeRedirect() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.pub.role === "senior") redirect("/me/senior");
  redirect("/me/junior");
}
