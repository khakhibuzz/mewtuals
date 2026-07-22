import { CaseStudies } from "./components/CaseStudies";
import { ForStartups } from "./components/ForStartups";
import { Hero } from "./components/Hero";
import { SiteHeader } from "./components/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <CaseStudies />
        <ForStartups />
      </main>
    </>
  );
}
