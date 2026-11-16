import { redirect } from "next/navigation";

// Preserve existing bookmarks while sharing one member email entry.
export default function LoginPage() {
  redirect("/network/join");
}
