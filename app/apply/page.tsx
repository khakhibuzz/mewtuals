import { ApplySection } from "../components/ApplySection";
import { SiteHeader } from "../components/SiteHeader";

export default function ApplyPage() {
  return (
    <>
      <SiteHeader anchorBase="/" />
      <main>
        <ApplySection />
      </main>
    </>
  );
}
