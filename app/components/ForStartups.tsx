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
        </div>
      </div>
      <ol aria-label="A startup’s changing needs" className="startup-stages">
        <li><span>01</span>Idea</li>
        <li><span>02</span>Product</li>
        <li><span>03</span>Customers</li>
        <li><span>04</span>Next constraint</li>
        <li><span>05</span>Vision in motion</li>
      </ol>
    </section>
  );
}
