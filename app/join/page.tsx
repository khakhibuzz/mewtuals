import {
  MAX_OPPORTUNITY_BRIEF_SOURCE_LENGTH,
  MAX_OPPORTUNITY_BRIEF_UTM_VALUE_LENGTH,
} from "../domain/opportunity-brief";
import {
  OpportunityBriefForm,
  type OpportunityBriefTracking,
} from "../components/product/OpportunityBriefForm";
import { ProductShell } from "../components/product/ProductShell";

type JoinPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const utmQueryKeys = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
  utm_term: "term",
  utm_content: "content",
} as const;

function singleQueryValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : undefined;
}

export function parseOpportunityBriefTracking(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): OpportunityBriefTracking {
  const sourceValue = singleQueryValue(searchParams?.source);
  const source =
    sourceValue &&
    sourceValue.length <= MAX_OPPORTUNITY_BRIEF_SOURCE_LENGTH &&
    /^[A-Za-z0-9._-]+$/.test(sourceValue)
      ? sourceValue
      : undefined;
  const utm: OpportunityBriefTracking["utm"] = {};

  for (const [queryKey, domainKey] of Object.entries(utmQueryKeys) as Array<
    [keyof typeof utmQueryKeys, (typeof utmQueryKeys)[keyof typeof utmQueryKeys]]
  >) {
    const value = singleQueryValue(searchParams?.[queryKey]);
    if (value && value.length <= MAX_OPPORTUNITY_BRIEF_UTM_VALUE_LENGTH) {
      utm[domainKey] = value;
    }
  }

  return { ...(source ? { source } : {}), utm };
}

export default async function JoinPage({ searchParams }: JoinPageProps = {}) {
  const tracking = parseOpportunityBriefTracking(await searchParams);

  return (
    <ProductShell
      eyebrow="Opportunity brief"
      title="Find who you should collaborate with next."
      intro="Share your company or creator profile. Mewtuals will research it and send you three partnership directions worth exploring. No account required."
      headerAction={{ href: "/network/join", label: "Log in" }}
    >
      <OpportunityBriefForm tracking={tracking} />
    </ProductShell>
  );
}
