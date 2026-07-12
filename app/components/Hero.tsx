export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <h1>
          Mutuals represents a company’s interests, discovers non-obvious revenue
          paths, initiates the right conversations, and advances them until{" "}
          <strong>a human decision is required.</strong>
        </h1>
        <div className="hero-actions">
          <a className="primary-button" href="#apply">
            Represent my company
          </a>
          <a className="text-link" href="#how-it-works">
            See how an opportunity moves
          </a>
        </div>
        <p className="discipline-line">
          One company at a time. One opportunity until it moves.
        </p>
      </div>

      <figure className="hero-graph">
        {/* Vinext's local image optimizer is not available in this Sites runtime. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Opportunity movement from signal captured through conversation and aligned interest to a human decision"
          height="1402"
          src="/hero-opportunity-graph.png"
          width="1122"
        />
      </figure>
    </section>
  );
}
