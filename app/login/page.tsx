import { redirect } from "next/navigation";

// Joining and signing in share one email entry at /join. Keep /login so
// existing bookmarks and older emails still arrive there.
export default function LoginPage() {
  redirect("/join");
}
