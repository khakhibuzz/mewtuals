export function ForStartups() {
  return (
    <section className="startups-section site-section" id="for-startups">
      <p className="section-label">For startups</p>
      <div className="startups-layout">
        <h2>Built for companies that move at internet speed.</h2>
        <div className="startups-copy">
          <p>
            AI startups, creator-economy companies, and consumer brands already
            live where reputation, distribution, and demand move quickly. We learn
            the company as it is now, then advance the relationships that can
            support its next step.
          </p>
          <p className="startups-principle">
            Less corporate theatre. More useful movement.
          </p>
          <a className="startups-cta text-link" href="/join">
            Join Mewtuals
          </a>
        </div>
      </div>
      <div
        aria-label="How Mewtuals changes the business map"
        className="about-comparison"
      >
        <div>
          <span>The usual map</span>
          <strong>Who are you competing with?</strong>
        </div>
        <div>
          <span>The Mewtuals map</span>
          <strong>What becomes possible together?</strong>
        </div>
      </div>
    </section>
  );
}
