import {
  Cpu,
  Factory,
  Package,
  Robot,
  ShareNetwork,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";

const stages = [
  {
    Icon: Cpu,
    title: "Components",
    description: "Sensors, actuators, compute, power.",
  },
  {
    Icon: Factory,
    title: "Manufacturing",
    description: "Contract manufacturing and EMS partners.",
  },
  {
    Icon: Robot,
    title: "OEMs",
    description: "Robot builders and platform OEMs.",
  },
  {
    Icon: ShareNetwork,
    title: "Integrators",
    description: "System integrators and solution partners.",
  },
  {
    Icon: Package,
    title: "Distribution",
    description: "Distributors, resellers, and channel partners.",
  },
  {
    Icon: UsersThree,
    title: "Media",
    description: "Media, analysts, and industry communities.",
  },
] as const;

export function EcosystemChain() {
  return (
    <ol aria-label="Physical AI ecosystem stages" className="ecosystem-chain">
      {stages.map(({ Icon, title, description }, index) => (
        <li key={title}>
          <div className="ecosystem-stage">
            <Icon aria-hidden="true" size={30} strokeWidth={1.5} />
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
          </div>
          {index < stages.length - 1 ? (
            <span aria-hidden="true" className="ecosystem-chain-arrow">
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
