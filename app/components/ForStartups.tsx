export function ForStartups() {
  return (
    <section className="startups-section site-section" id="for-startups">
      <p className="section-label">For startups</p>
      <div className="startups-layout">
        <h2>
          A startup begins as a small living idea. Then execution asks it to become
          a company.
        </h2>
        <div className="startups-copy">
          <p>
            We learn the company as it is now—its product, customers, constraints,
            leverage, and immediate need—then advance the relationships that can
            support its next step toward the vision.
          </p>
          <p className="startups-principle">
            The need changes. The company stays the client.
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
