export function AboutSection() {
  return (
    <section className="about-section site-section" id="about">
      <p className="section-label">About</p>
      <div className="about-layout">
        <h2>
          Competition explains how value is divided. We look for value that has
          not been created yet.
        </h2>
        <div className="about-copy">
          <p>
            Mainstream startup and business narratives map competitors. Mutuals
            maps complementary needs, assets, timing, trust, and customer
            touchpoints.
          </p>
          <p>
            We do not force companies together. We find natural two-sided value,
            make the first ask, and carry the work until a decision belongs with
            the people responsible for it.
          </p>
        </div>
      </div>
      <div className="about-comparison" aria-label="How Mutuals changes the business map">
        <div><span>The usual map</span><strong>Who are you competing with?</strong></div>
        <div><span>The Mutuals map</span><strong>What becomes possible together?</strong></div>
      </div>
    </section>
  );
}
