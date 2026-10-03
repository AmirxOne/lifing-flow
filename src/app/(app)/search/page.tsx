import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { SearchClient } from "./search-client";

export const metadata = { title: "جستجو" };

export default async function SearchPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <SearchClient />;
}
