import type { Metadata } from "next";
import Link from "next/link";
import styles from "./robotics-data.module.css";

const title = "Mewtuals Data — Real-world data for robotics";
const description =
  "We connect robotics labs and data companies with factories and commercial workplaces to collect first-person demonstrations of real work. Start with a focused collection pilot.";

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  openGraph: {
    title,
    description,
    type: "website",
    url: "https://mewtuals.com/robotics-data",
    images: [],
  },
  twitter: { card: "summary", title, description, images: [] },
};

const workflows = [
  { number: "01", title: "Pick. Pack. Sort.", detail: "Handling objects, packing orders and sorting goods." },
  { number: "02", title: "Assemble. Inspect.", detail: "Working with parts, tools and quality checks." },
  { number: "03", title: "Stock. Fulfil.", detail: "Moving inventory and replenishing store shelves." },
];

const pilotSteps = [
  { title: "Define the brief", detail: "Tell us the tasks, environments, capture setup and data format you need." },
  { title: "Scope the collection", detail: "Together, we agree on suitable sites, worker consent, usage rights and quality criteria." },
  { title: "Validate a pilot", detail: "Start with a small collection. Review the data against your criteria before expanding." },
];

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export default function RoboticsDataPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/" prefetch={false} aria-label="Mewtuals home">
          <span aria-hidden="true" className={styles.mark}>m</span>
          Mewtuals <span className={styles.wordmarkDivision}>/ Data</span>
        </Link>
        <a className={styles.headerLink} href="#pilot">Let’s talk <Arrow /></a>
      </header>

      <main id="main-content">
        <section className={styles.hero} aria-labelledby="data-heading">
          <p className={styles.eyebrow}><span className={styles.dot} /> Real-world data for robotics</p>
          <h1 id="data-heading">Real work.<br /><span>Better robot data.</span></h1>
          <div className={styles.heroBottom}>
            <div className={styles.introduction}>
              <p>We connect robotics labs and data companies with factories and commercial workplaces to collect first-person demonstrations of real work.</p>
              <a className={styles.primaryLink} href="#pilot">Build your collection pilot <Arrow /></a>
              <p className={styles.availability}>Now scoping our first collection partnerships.</p>
            </div>
            <figure className={styles.pipeline} aria-label="Collection model: real workplaces, first-person capture, data for your team">
              <figcaption>From the factory floor to your model</figcaption>
              <ol>
                <li><span className={styles.pipelineNode} aria-hidden="true">01</span><div><strong>Real workplaces</strong><span>People doing everyday tasks</span></div></li>
                <li><span className={styles.pipelineNode} aria-hidden="true">02</span><div><strong>First-person capture</strong><span>Collected to your specification</span></div></li>
                <li><span className={`${styles.pipelineNode} ${styles.finalNode}`} aria-hidden="true">03</span><div><strong>Data for your team</strong><span>A pilot you can evaluate</span></div></li>
              </ol>
            </figure>
          </div>
        </section>

        <section className={styles.workflows} aria-labelledby="workflows-heading">
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrow}>The work is already happening</p>
            <h2 id="workflows-heading">Bring your data requirements.<br />We bring the workplace access.</h2>
            <p>We help coordinate sites, people and on-site collection. You define what your models need.</p>
          </div>
          <div className={styles.workflowGrid}>
            {workflows.map((workflow) => (
              <article key={workflow.number}>
                <span className={styles.number}>{workflow.number}</span>
                <h3>{workflow.title}</h3>
                <p>{workflow.detail}</p>
              </article>
            ))}
          </div>
          <p className={styles.note}>Example workflows. Site and task availability are confirmed when we scope your pilot.</p>
        </section>

        <section className={styles.pilot} id="pilot" aria-labelledby="pilot-heading">
          <div className={styles.pilotInvitation}>
            <p className={styles.eyebrow}>Start with one useful dataset</p>
            <h2 id="pilot-heading">Your next dataset<br />starts with a conversation.</h2>
            <p>Looking for a collection partner? Let’s find out what a focused pilot could look like for your team.</p>
            <a className={styles.primaryLink} href="mailto:keshav@mewtuals.com?subject=Robotics%20data%20collection%20pilot">Discuss a data pilot <Arrow /></a>
            <p className={styles.contact}>keshav@mewtuals.com</p>
          </div>
          <ol className={styles.steps}>
            {pilotSteps.map((step, index) => (
              <li key={step.title}>
                <span className={styles.number}>0{index + 1}</span>
                <div><h3>{step.title}</h3><p>{step.detail}</p></div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>Mewtuals / Data</span>
        <span>Human work. Machine learning.</span>
      </footer>
    </div>
  );
}
