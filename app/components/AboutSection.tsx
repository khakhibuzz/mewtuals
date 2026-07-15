export function AboutSection() {
  return (
    <section className="about-section site-section" id="about">
      <p className="section-label">About</p>
      <div className="about-layout">
        <h2>Less corporate in tone. Exacting in practice.</h2>
        <div className="about-copy">
          <p>
            Mewtuals represents internet-native companies with the same seriousness
            as a traditional partnerships firm—without the theatre, jargon, or
            distance.
          </p>
          <p>
            We map complementary needs, assets, timing, trust, and customer
            touchpoints, then carry the work until a decision belongs with the
            people responsible for it.
          </p>
        </div>
      </div>
      <div className="about-comparison" aria-label="How Mewtuals changes the business map">
        <div><span>The usual map</span><strong>Who are you competing with?</strong></div>
        <div><span>The Mewtuals map</span><strong>What becomes possible together?</strong></div>
      </div>
    </section>
  );
}
