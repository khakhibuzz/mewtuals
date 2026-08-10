import {
  ChartLineUp,
  Handshake,
  Megaphone,
  ShareNetwork,
} from "@phosphor-icons/react/dist/ssr";

const outcomes = [
  {
    Icon: ShareNetwork,
    title: "Supply chain access",
    description:
      "Connect with vetted component suppliers and manufacturing partners at the right depth.",
  },
  {
    Icon: Handshake,
    title: "Distribution and pilots",
    description:
      "Identify channel partners, integrators, and pilot opportunities that fit.",
  },
  {
    Icon: Megaphone,
    title: "Media and visibility",
    description:
      "Reach the right audiences through trusted robotics media and communities.",
  },
  {
    Icon: ChartLineUp,
    title: "Ecosystem intelligence",
    description:
      "Stay ahead with signals, landscape maps, and partnership insights.",
  },
] as const;

export function EcosystemOutcomes() {
  return (
    <div className="ecosystem-outcomes">
      {outcomes.map(({ Icon, title, description }) => (
        <article className="ecosystem-outcome" key={title}>
          <Icon aria-hidden="true" size={34} strokeWidth={1.45} />
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
