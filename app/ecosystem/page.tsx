import { EcosystemChain } from "../components/EcosystemChain";
import { EcosystemOutcomes } from "../components/EcosystemOutcomes";
import { SiteHeader } from "../components/SiteHeader";

export default function EcosystemPage() {
  return (
    <>
      <SiteHeader />
      <main className="ecosystem-page">
        <section className="ecosystem-overview ecosystem-panel">
          <div className="ecosystem-intro">
            <p className="section-label">The Physical AI ecosystem</p>
            <h1>How the ecosystem fits together</h1>
            <p>
              Physical AI moves when the right layer meets the next one. Mewtuals
              makes those connections deliberate.
            </p>
          </div>

          <div className="ecosystem-chain-section">
            <EcosystemChain />
          </div>
        </section>

        <section className="ecosystem-unlocks ecosystem-panel" id="unlocks">
          <div className="ecosystem-section-heading">
            <h2>What Mewtuals can unlock</h2>
            <a className="text-link" href="/join">
              Join Mewtuals
            </a>
          </div>
          <EcosystemOutcomes />
        </section>
      </main>
    </>
  );
}
