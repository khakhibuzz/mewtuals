import {
  BracketsCurly,
  Cpu,
  Factory,
  Flask,
  Package,
  Robot,
  ShareNetwork,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";

const participants = [
  { Icon: Cpu, label: "Component suppliers" },
  { Icon: Robot, label: "OEMs & robot builders" },
  { Icon: ShareNetwork, label: "System integrators" },
  { Icon: Package, label: "Distributors & channels" },
  { Icon: UsersThree, label: "Media & communities" },
  { Icon: Flask, label: "Labs & researchers" },
  { Icon: Factory, label: "Contract manufacturers" },
  { Icon: BracketsCurly, label: "Software & AI companies" },
] as const;

export function EcosystemMap() {
  return (
    <figure
      aria-label="Mewtuals at the centre of the Physical AI partnership ecosystem"
      className="ecosystem-map"
    >
      <div aria-hidden="true" className="ecosystem-orbit ecosystem-orbit-outer" />
      <div aria-hidden="true" className="ecosystem-orbit ecosystem-orbit-inner" />
      <div className="ecosystem-map-center" aria-hidden="true">
        M
      </div>
      <ul>
        {participants.map(({ Icon, label }, index) => (
          <li className={`ecosystem-node ecosystem-node-${index + 1}`} key={label}>
            <Icon aria-hidden="true" size={22} strokeWidth={1.6} />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
