import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./factory-partners.module.css";
import { contactedOrganizations } from "./outreach";

const title = "Mewtuals — Factory pilots for robot training";
const description =
  "Explore a paid factory pilot using a stereo camera headset to record everyday work from a worker’s point of view, exclusively for training robots.";
const contactHref =
  "mailto:keshav@mewtuals.com?subject=Factory%20data%20collection%20pilot";

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  openGraph: {
    title,
    description,
    type: "website",
    url: "https://mewtuals.com/factory-partners",
    images: [],
  },
  twitter: { card: "summary", title, description, images: [] },
};

const process = [
  {
    label: "Agree",
    title: "Choose the work together.",
    detail:
      "We choose a suitable workflow with you and agree paid pilot terms. Site approval and each participating worker’s consent come before any recording.",
  },
  {
    label: "Capture",
    title: "Record the worker’s view.",
    detail:
      "A worker wears a stereo camera headset while carrying out the agreed task. The cameras show how they handle parts and tools from their point of view.",
  },
  {
    label: "Prepare",
    title: "Prepare task clips for training.",
    detail:
      "We review and organize task clips as examples for training robots. Delivery or licensing is limited to recipients approved in the written pilot terms.",
  },
];

const ownerBenefits = [
  {
    title: "Your factory is paid to host the pilot",
    detail:
      "We agree what your factory will be paid and when, before recording begins.",
  },
  {
    title: "A workflow you help choose",
    detail:
      "Discuss which tasks, areas and participating workers are suitable for your site. Keep sensitive work outside the agreed scope.",
  },
  {
    title: "A plan that considers your operations",
    detail:
      "Agree the schedule and capture setup with us to limit disruption. Your production needs and site constraints guide the plan.",
  },
];

const recordingRules = [
  {
    title: "Permission before recording",
    detail:
      "Site approval and informed consent from participating workers are required before recording. Agree the tasks, areas and times that may be recorded.",
  },
  {
    title: "A defined purpose and audience",
    detail:
      "The pilot terms must identify approved recipients and limit access and use to robot training. They must prohibit worker performance monitoring, marketing, public posting, further resale and uses outside robot training.",
  },
  {
    title: "Clear retention and limits",
    detail:
      "Agree how long recordings may be kept, when they must be deleted, and any further restrictions in the pilot terms before recording begins.",
  },
];

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export default function FactoryPartnersPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <header className={styles.header}>
        <Link className={styles.wordmark} href="/" prefetch={false} aria-label="Mewtuals home">
          <span className={styles.mark} aria-hidden="true">m</span>
          Mewtuals <span className={styles.division}>/ Factory pilots</span>
        </Link>
        <a className={styles.headerLink} href="#contact">Let’s talk <Arrow /></a>
      </header>

      <main id="main-content">
        <section className={styles.hero} aria-labelledby="factory-heading">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>For factory owners</p>
            <h1 id="factory-heading">Real work.<br /><span>A new way to teach robots.</span></h1>
            <p className={styles.introduction}>
              A stereo camera headset records your workers’ ordinary tasks from
              their point of view. We prepare those recordings for use
              exclusively in training robots.
            </p>
            <a className={styles.primaryLink} href="#how-it-works">See how the pilot works <span aria-hidden="true">↓</span></a>
            <p className={styles.heroNote}>A paid pilot, with the scope and terms agreed before recording.</p>
          </div>
          <figure className={styles.heroImage}>
            <Image
              src="/factory-partners/stereo-capture.webp"
              alt="Illustration of a factory worker wearing a stereo camera headset while carrying out a task."
              width={1536}
              height={1024}
              priority
              unoptimized
            />
            <figcaption>Illustration of a stereo headset in use.</figcaption>
          </figure>
        </section>

        <section className={styles.process} id="how-it-works" aria-labelledby="process-heading">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>How the pilot works</p>
            <h2 id="process-heading">From the factory floor<br />to robot training.</h2>
          </div>
          <ol className={styles.processSteps}>
            {process.map((step) => (
              <li key={step.label}>
                <span className={styles.processLabel}>{step.label}</span>
                <h3>{step.title}</h3>
                <p>{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.ownerSection} aria-labelledby="owner-heading">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Why take part</p>
            <h2 id="owner-heading">A paid pilot,<br />shaped around your site.</h2>
            <p>Your team already knows the work. A pilot explores how that practical knowledge can help robots learn.</p>
          </div>
          <div className={styles.ownerBenefits}>
            {ownerBenefits.map((benefit) => (
              <article key={benefit.title}>
                <h3>{benefit.title}</h3>
                <p>{benefit.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.rules} aria-labelledby="rules-heading">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>The recording rules</p>
            <h2 id="rules-heading">Agree the boundaries.<br />Then record.</h2>
            <p>These conditions belong in the written pilot terms. Recording starts only after the scope, permissions and limits are agreed.</p>
          </div>
          <dl className={styles.ruleList}>
            {recordingRules.map((rule) => (
              <div key={rule.title}>
                <dt>{rule.title}</dt>
                <dd>{rule.detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.contact} id="contact" aria-labelledby="contact-heading">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>The people behind Mewtuals</p>
            <h2 id="contact-heading">Started by<br />IIT Ropar graduates.</h2>
            <p>Keshav Garg is your point of contact for factory pilots.</p>
            <a className={styles.profileLink} href="https://www.linkedin.com/in/keshav-garg/">
              Keshav Garg on LinkedIn <Arrow />
            </a>
          </div>
          <div className={styles.contactInvitation}>
            <p className={styles.contactPrompt}>Could a pilot fit your factory?</p>
            <p>Tell Keshav about your site and the work your team does. We can discuss a suitable task, your constraints and what a paid pilot would involve.</p>
            <a className={styles.primaryLink} href={contactHref}>Talk to Keshav Garg <Arrow /></a>
            <p className={styles.email}>keshav@mewtuals.com</p>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.terms}>
          <h2>Terms &amp; Conditions</h2>
          <p>Participation, payment, recording permissions, access, use and retention are subject to written pilot terms agreed before recording. This page describes a proposed collection pilot; it does not confirm an active collection at your site.</p>
          <h3 className={styles.outreachHeading}>Robotics outreach</h3>
          <p>We’ve reached out to these organizations about data collection for robot training. Outreach does not imply a partnership, endorsement, or access to recordings.</p>
          <ul className={styles.outreachList}>
            {contactedOrganizations.map((name) => <li key={name}>{name}</li>)}
          </ul>
        </div>
        <div className={styles.footerLine}>
          <span>Mewtuals / Factory pilots</span>
        </div>
      </footer>
    </div>
  );
}
