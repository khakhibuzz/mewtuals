export type ValueEquation = {
  need: string;
  asset: string;
  moment: string;
  whyNow: string;
  test: string;
};

export type CaseStudy = {
  id: string;
  number: `0${1 | 2 | 3 | 4 | 5}`;
  illustrative: true;
  opportunityType: string;
  title: string;
  thesis: string;
  equation: ValueEquation;
  situation: string;
  signal: string;
  hiddenLeverage: string;
  counterpart: string;
  valueExchange: {
    representedCompany: string;
    counterpart: string;
    customer: string;
  };
  test: string;
  firstApproach: string;
  executionSteps: readonly [string, string, string, string];
  successMeasures: readonly string[];
  risks: readonly string[];
  decisionGate: string;
};

export const caseStudies: readonly CaseStudy[] = [
  {
    id: "study-01",
    number: "01",
    illustrative: true,
    opportunityType: "Support automation × product analytics",
    title: "Resolve the moment of friction",
    thesis:
      "When analytics detects a customer stuck inside a repeatable workflow, an action-taking support agent can complete that workflow before frustration becomes a ticket or churn signal.",
    equation: {
      need: "An unresolved in-product task",
      asset: "a browser-action agent",
      moment: "a detected friction moment",
      whyNow: "rising support cost",
      test: "one bounded assisted completion",
    },
    situation:
      "A SaaS company sees repeat tickets around a multi-step account workflow. Its analytics platform can detect rage clicks and repeated failed attempts, but can only report the problem.",
    signal:
      "The same workflow produces a concentrated cluster of rage clicks, repeat visits, and support requests.",
    hiddenLeverage:
      "The analytics product knows exactly when help is needed; the support agent can act in the browser rather than return instructions.",
    counterpart:
      "A product-analytics or digital-adoption startup with live friction signals and customers asking what to do after detection.",
    valueExchange: {
      representedCompany:
        "The support agent gains qualified design customers, real procedures, and production learning.",
      counterpart:
        "The analytics partner gains a measurable remediation layer and stronger outcome story.",
      customer:
        "The customer gets the task completed at the moment of friction without entering a separate support loop.",
    },
    test:
      "One consenting customer cohort, one reversible workflow, and one 30-day pilot with explicit action limits.",
    firstApproach:
      "You already identify the point of failure. We represent a team that can safely complete one bounded workflow at that exact moment. Would you test whether detection plus action improves completion for one customer cohort?",
    executionSteps: [
      "Verify baseline and permissions",
      "Integrate one signal and workflow",
      "Run a supervised cohort",
      "Review completion, escalation, and incident evidence",
    ],
    successMeasures: [
      "Workflow completion",
      "Avoided tickets",
      "Time to resolution",
      "Human-escalation rate",
      "Incorrect-action incidents",
    ],
    risks: [
      "Excessive permissions",
      "Actions in ambiguous states",
      "User consent",
      "Cross-product data handling",
      "Confusing assistance with autonomous authority",
    ],
    decisionGate:
      "Both founders approve the permitted actions, customer cohort, escalation policy, and continuation only after baseline evidence is credible.",
  },
  {
    id: "study-02",
    number: "02",
    illustrative: true,
    opportunityType: "Wellness commerce × local service touchpoint",
    title: "Continue a customer’s intention",
    thesis:
      "A wellness purchase reveals a moment of intent that a trusted local service can continue without turning the brand’s post-purchase experience into an advertisement.",
    equation: {
      need: "A completed wellness purchase",
      asset: "available local-service capacity",
      moment: "the post-purchase moment",
      whyNow: "a newly opened location",
      test: "one permissioned local invitation",
    },
    situation:
      "A wellness brand completes the sale online. A nearby spa has unused weekday capacity and needs qualified local discovery.",
    signal:
      "Customers in selected postcodes buy a product associated with an ongoing routine rather than a one-time transaction.",
    hiddenLeverage:
      "The brand owns a high-trust post-purchase touchpoint; the spa can turn the product promise into a physical experience.",
    counterpart:
      "A quality-controlled spa or wellness studio with a newly opened location and transparent service standards.",
    valueExchange: {
      representedCompany:
        "The brand adds useful continuity and learns about offline engagement.",
      counterpart: "The spa receives qualified local demand.",
      customer:
        "Customers receive a relevant option rather than a generic promotion.",
    },
    test:
      "A non-medical, opt-in invitation to 100 eligible purchasers in two postcodes, with no customer data shared before consent.",
    firstApproach:
      "Your new location can be useful at the precise moment these customers begin a wellness routine. Would you reserve a small, trackable experience for an opt-in cohort rather than run a broad discount?",
    executionSteps: [
      "Approve brand and service fit",
      "Define consent and offer",
      "Run the cohort",
      "Compare redemption, repeat behavior, and complaints",
    ],
    successMeasures: [
      "Opt-in rate",
      "Qualified booking rate",
      "Redemption",
      "Repeat purchase or visit",
      "Opt-outs and complaints",
    ],
    risks: [
      "Health claims",
      "Inappropriate location use",
      "Discount-led demand",
      "Inconsistent service quality",
      "Brand-safety mismatch",
    ],
    decisionGate:
      "Both companies approve the message, service standard, economics, customer-consent flow, and any public association.",
  },
  {
    id: "study-03",
    number: "03",
    illustrative: true,
    opportunityType: "Consumer brand × manufacturing access",
    title: "Unlock the next production run",
    thesis:
      "When a growing consumer brand is too large for small-batch production but too early for a major factory commitment, the right manufacturer can turn proven demand into dependable supply.",
    equation: {
      need: "A constrained production run",
      asset: "quality-controlled manufacturing capacity",
      moment: "the reorder threshold",
      whyNow: "proven customer demand",
      test: "one bounded production batch",
    },
    situation:
      "A consumer brand has repeat demand but cannot secure a production partner at the volume, quality, and lead time it can responsibly commit to.",
    signal:
      "Reorders are arriving faster than the current supplier can fulfil, while the next factory tier asks for volumes the company cannot yet justify.",
    hiddenLeverage:
      "The brand brings validated demand and a focused product line; a specialist manufacturer has suitable capacity and wants credible emerging-brand volume.",
    counterpart:
      "A quality-controlled manufacturer with compatible materials, transparent lead times, and capacity for a limited first run.",
    valueExchange: {
      representedCompany:
        "The brand gains dependable supply without making a premature long-term commitment.",
      counterpart:
        "The manufacturer gains a qualified new account with visible demand and a staged path to volume.",
      customer:
        "Customers receive the product with more predictable availability and quality.",
    },
    test:
      "One bounded batch with agreed specifications, inspection criteria, lead time, payment milestones, and no exclusivity.",
    firstApproach:
      "This brand has repeat demand but needs a responsible bridge between small-batch supply and a major factory commitment. Would you scope one bounded run against an agreed quality and lead-time standard?",
    executionSteps: [
      "Confirm demand, specifications, and target economics",
      "Validate capacity, materials, and quality controls",
      "Contract one bounded production batch",
      "Review yield, lead time, landed cost, and reorder evidence",
    ],
    successMeasures: [
      "Accepted units",
      "On-time production",
      "Landed unit cost",
      "Defect rate",
      "Reorder readiness",
    ],
    risks: [
      "Quality variance",
      "Unclear tooling or material ownership",
      "Working-capital pressure",
      "Lead-time slippage",
      "Premature exclusivity",
    ],
    decisionGate:
      "Both companies approve the specifications, inspection standard, payment milestones, delivery window, ownership terms, and continuation threshold.",
  },
  {
    id: "study-04",
    number: "04",
    illustrative: true,
    opportunityType: "Developer tooling × implementation channel",
    title: "Complete the product with delivery",
    thesis:
      "When a technically strong tool loses qualified trials during setup, a trusted implementation partner can turn product capability into customer time-to-value.",
    equation: {
      need: "A stalled qualified trial",
      asset: "implementation capacity",
      moment: "the setup moment",
      whyNow: "buyer urgency",
      test: "one fixed-scope activation sprint",
    },
    situation:
      "A developer product earns serious trials, but a portion stall during integration because the buyer lacks time or specialist capacity.",
    signal:
      "Qualified accounts repeatedly reach the same setup step, open documentation, contact support, and then go inactive.",
    hiddenLeverage:
      "The product company can identify high-intent stalled accounts; a consultancy can deliver the missing implementation and gain a differentiated offer.",
    counterpart:
      "A focused cloud or software consultancy with referenceable delivery quality and capacity for a fixed-scope sprint.",
    valueExchange: {
      representedCompany:
        "The product converts more qualified trials and reduces founder-led onboarding.",
      counterpart:
        "The consultancy receives scoped work and a repeatable specialization.",
      customer: "Customers reach value sooner.",
    },
    test:
      "Three qualified stalled accounts are offered an optional, fixed-deliverable activation sprint with separate consent and pricing.",
    firstApproach:
      "Three qualified teams are blocked at the same integration step. Would you define a fixed-scope sprint that gets them to the first successful production outcome without taking over the product relationship?",
    executionSteps: [
      "Select the repeated setup boundary",
      "Agree ownership and quality bar",
      "Deliver three sprints",
      "Review activation, margin, and customer feedback",
    ],
    successMeasures: [
      "Trial-to-activation rate",
      "Time to first production result",
      "Support hours saved",
      "Sprint margin",
      "Customer ownership disputes",
    ],
    risks: [
      "Unclear account ownership",
      "Inconsistent delivery",
      "Support liability",
      "Consultancy dependence",
      "Services masking product flaws",
    ],
    decisionGate:
      "Both companies approve the statement of work, customer ownership, support boundaries, quality standard, and pricing.",
  },
  {
    id: "study-05",
    number: "05",
    illustrative: true,
    opportunityType: "Mobility demand × hospitality distribution",
    title: "Use a physical moment already in motion",
    thesis:
      "A hospitality company and a mobility product can improve the same arrival or departure moment by coordinating a useful guest handoff rather than buying generic reach.",
    equation: {
      need: "A guest arrival need",
      asset: "reliable mobility capacity",
      moment: "the booking or checkout moment",
      whyNow: "predictable route demand",
      test: "one coordinated transfer flow",
    },
    situation:
      "Boutique hotels repeatedly help guests arrange transport. A mobility startup needs concentrated, repeatable demand on valuable routes.",
    signal:
      "Front desks handle the same transfer questions while the mobility company sees recurring pickup and return patterns around hotel clusters.",
    hiddenLeverage:
      "Hotels own trusted pre-arrival and checkout touchpoints; the mobility company owns fulfillment and route intelligence.",
    counterpart:
      "A small hotel group with high guest-service standards and enough concentrated arrival volume for a controlled pilot.",
    valueExchange: {
      representedCompany:
        "The mobility company receives qualified demand and repeat routes.",
      counterpart:
        "Hotels reduce staff coordination and improve guest experience.",
      customer: "Guests receive a clearer, accountable option.",
    },
    test:
      "Two hotels run a four-week opt-in transfer flow for one airport route with no exclusivity.",
    firstApproach:
      "Your teams already coordinate this route manually. Would you test one accountable transfer flow at booking and checkout, with service failures visible to both sides and no exclusivity?",
    executionSteps: [
      "Map the repeated route and failure modes",
      "Agree service and escalation standards",
      "Launch at two properties",
      "Review trips, incidents, and front-desk effort",
    ],
    successMeasures: [
      "Booking-to-trip conversion",
      "Completed trips",
      "Service incidents",
      "Guest satisfaction",
      "Front-desk minutes saved",
      "Repeat-route rate",
    ],
    risks: [
      "Service failures reflecting on the hotel",
      "Inappropriate data sharing",
      "Accessibility needs",
      "Exclusivity pressure",
      "Demand spikes",
    ],
    decisionGate:
      "Both operators approve the service-level agreement, brand placement, data boundaries, escalation process, and continuation threshold.",
  },
];
