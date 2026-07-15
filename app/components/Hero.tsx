export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="hero-eyebrow">
          The external partnerships function for internet-native companies.
        </p>
        <h1>
          One partnership can change a company. {" "}
          <strong>We find the right one.</strong>
        </h1>
        <p className="hero-support">
          Mewtuals researches your company, identifies where another organisation
          can unlock growth, and advances the relationship from hypothesis to
          pilot.
        </p>
        <div className="hero-actions">
          <a className="primary-button" href="/join">
            Find my next partnership
          </a>
          <a className="text-link" href="#how-it-works">
            See how it works
          </a>
        </div>
      </div>

      <figure className="hero-graph">
        {/* Vinext's local image optimizer is not available in this Sites runtime. */}
        <picture>
          <source
            media="(max-width: 640px)"
            srcSet="/hero-opportunity-graph-mobile.webp"
            type="image/webp"
          />
          <source
            media="(max-width: 640px)"
            srcSet="/hero-opportunity-graph-mobile.png"
            type="image/png"
          />
          <source srcSet="/hero-opportunity-graph.webp" type="image/webp" />
          <img
            alt="Qualitative Mewtuals partnership progression: Signal captured, Conversation initiated, Interest aligned, and Human decision required."
            height="1402"
            src="/hero-opportunity-graph.png"
            width="1122"
          />
        </picture>
      </figure>
    </section>
  );
}
