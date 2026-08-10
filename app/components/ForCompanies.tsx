export function ForCompanies() {
  return (
    <section className="companies-section site-section" id="for-companies">
      <p className="section-label">For companies</p>
      <div className="companies-layout">
        <h1>Built for companies bringing intelligence into the physical world.</h1>
        <div className="companies-copy">
          <p>
            Robotics and Physical AI companies grow through an ecosystem of
            components, manufacturing, pilots, distribution, and trust. We learn
            the company as it is now, then advance the relationships that can
            support its next step.
          </p>
          <p className="companies-principle">
            Less corporate theatre. More useful movement.
          </p>
          <a className="companies-cta text-link" href="/join">
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
