import { EcosystemMap } from "./EcosystemMap";

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="hero-eyebrow">
          The External Partnerships function for Physical AI companies
        </p>
        <h1>
          One partnership can change a company. {" "}
          <strong>We find the right one.</strong>
        </h1>
        <p className="hero-support">
          Mewtuals maps the Physical AI ecosystem, identifies the right
          counterparties, and advances partnerships from signal to pilot.
        </p>
        <div className="hero-actions">
          <a className="primary-button" href="/join">
            Find my next partnership
          </a>
          <a className="text-link" href="/ecosystem">
            Explore the ecosystem
          </a>
        </div>
      </div>

      <EcosystemMap />
    </section>
  );
}
