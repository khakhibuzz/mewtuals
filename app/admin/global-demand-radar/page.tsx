import { redirect } from "next/navigation";

export default async function GlobalRadarRootPage() {
  redirect("/admin/global-demand-radar/direct-demand");
}
