import type { BatteryPolicy } from "../domain/battery-policy";

export const batteryPolicies: readonly BatteryPolicy[] = [
  {
    "id": "pm-edrive-2026",
    "title": "PM E-DRIVE: updated demand-support horizon",
    "issuer": "Ministry of Heavy Industries",
    "date": "2026-08-10",
    "dateLabel": "Update listed",
    "status": "Amended programme",
    "area": "Demand & charging",
    "affected": [
      "EV manufacturers",
      "Pack suppliers",
      "Fleet buyers"
    ],
    "change": "The notification index lists an August 2026 e-two-wheeler extension. The current scheme portal states an end date of 31 March 2028 for all segments except L5 electric three-wheelers, whose support closed on 26 December 2025.",
    "impact": "A longer support period can help suppliers plan battery orders, but demand assumptions must remain vehicle-category specific. One subsidy timeline cannot be applied to every EV pack.",
    "limitation": "Model eligibility, segment limits and available funding still apply. Current portal wording is used here; older March 2026 deadlines are not treated as current. No revised per-vehicle rate or outlay is inferred from older releases.",
    "sources": [
      {
        "title": "MHI scheme brief",
        "url": "https://pmedrive.heavyindustries.gov.in/about-us",
        "date": null
      },
      {
        "title": "MHI notification index",
        "url": "https://pmedrive.heavyindustries.gov.in/policy_document",
        "date": null
      }
    ],
    "checkedAt": "2026-09-06"
  },
  {
    "id": "acc-pli-2026",
    "title": "ACC PLI: localisation conditions and capacity reality",
    "issuer": "Ministry of Heavy Industries",
    "date": "2026-03-27",
    "dateLabel": "Implementation snapshot",
    "status": "Active beneficiary scheme",
    "area": "Manufacturing",
    "affected": [
      "Cell makers",
      "Materials suppliers",
      "Factory equipment",
      "Pack buyers"
    ],
    "change": "The ₹18,100-crore Advanced Chemistry Cell (ACC) programme targets 50 GWh. MHI’s March 2026 reply reported 40 GWh awarded and 1 GWh installed among programme beneficiaries. Beneficiaries must reach at least 25% domestic value addition, rising to 60% within five years; investment conditions also apply.",
    "impact": "Cell makers have an incentive to qualify local materials and equipment suppliers. Buyers should still distinguish capacity awards from production that can supply validated cells today.",
    "limitation": "These are programme-beneficiary conditions, not a blanket import ban. The capacity figures are a 27 March 2026 snapshot, not a September installed-capacity estimate. Selection and programme agreements govern incentives.",
    "sources": [
      {
        "title": "MHI parliamentary reply",
        "url": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2246037&lang=2&reg=3",
        "date": "2026-03-27"
      },
      {
        "title": "ACC programme conditions",
        "url": "https://heavyindustries.gov.in/en/pli-acc",
        "date": null
      }
    ],
    "checkedAt": "2026-09-06"
  },
  {
    "id": "critical-mineral-mission",
    "title": "National Critical Mineral Mission",
    "issuer": "Union Cabinet / Ministry of Mines",
    "date": "2025-01-29",
    "dateLabel": "Cabinet approval",
    "status": "Approved mission",
    "area": "Materials & imports",
    "affected": [
      "Exploration",
      "Refiners",
      "Active materials",
      "Recyclers"
    ],
    "change": "The seven-year mission has ₹16,300 crore in government expenditure and an expected ₹18,000 crore investment from PSUs and others. It covers exploration, mining, processing, recovery and overseas mineral assets.",
    "impact": "India’s battery supply chain could diversify upstream sourcing through domestic processing, recycling and overseas assets. Each route still has to produce consistent, battery-grade material.",
    "limitation": "Expected investment is not all government spending. Mission funding and mineral discovery do not prove operating mines, shipments or qualified battery-material output.",
    "sources": [
      {
        "title": "Cabinet mission approval",
        "url": "https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=2097309&lang=2&reg=48",
        "date": "2025-01-29"
      }
    ],
    "checkedAt": "2026-09-06"
  },
  {
    "id": "mineral-recycling-incentive",
    "title": "Critical-mineral recycling incentives",
    "issuer": "Ministry of Mines",
    "date": "2026-04-30",
    "dateLabel": "Implementation update",
    "status": "Guidelines issued; selection underway",
    "area": "Recycling",
    "affected": [
      "Battery recyclers",
      "Mineral recovery",
      "Scrap aggregators"
    ],
    "change": "The ₹1,500-crore programme runs from FY2025–26 to FY2030–31. Guidelines issued in October 2025 support extraction from eligible secondary feedstocks, including battery scrap; black-mass-only production is excluded. An April 2026 update reported 58 eligible entities.",
    "impact": "The incentive favours recovering usable minerals beyond mechanical shredding. Feedstock collection, sorting and refining quality become important links between recyclers and cell-material suppliers.",
    "limitation": "The first application window ended on 1 April 2026. Eligibility approval is not payment or commissioned output. Capital and operating incentives have separate thresholds, ceilings and execution requirements.",
    "sources": [
      {
        "title": "Ministry implementation update",
        "url": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2256977&lang=1&reg=3",
        "date": "2026-04-30"
      },
      {
        "title": "Scheme notification",
        "url": "https://egazette.gov.in/WriteReadData/2025/266005.pdf",
        "date": "2025-10-02"
      }
    ],
    "checkedAt": "2026-09-06"
  },
  {
    "id": "battery-waste-labels-2025",
    "title": "Battery Waste Management: EPR labelling flexibility",
    "issuer": "Ministry of Environment, Forest and Climate Change / CPCB",
    "date": "2025-02-24",
    "dateLabel": "Notified and effective",
    "status": "Notified rules",
    "area": "Recycling",
    "affected": [
      "Battery producers",
      "Importers",
      "Pack labels",
      "Recyclers"
    ],
    "change": "The 2025 amendment permits specified extended producer responsibility (EPR) registration labelling routes using barcode or QR information, subject to its conditions and communication to CPCB. It provides flexibility in where registration details appear.",
    "impact": "Producer registration data needs to travel with the product and packaging. Better information continuity can support downstream identification and recovery responsibilities.",
    "limitation": "This is not a universal compulsory digital battery passport. Labelling flexibility does not remove EPR obligations. CPCB registration is not a product-performance or safety certificate.",
    "sources": [
      {
        "title": "Original Gazette: S.O. 958(E)",
        "url": "https://cpcb.nic.in/uploads/hwmd/Battery-WasteManagementRules-2025.pdf",
        "date": "2025-02-24"
      }
    ],
    "checkedAt": "2026-09-06"
  },
  {
    "id": "charging-guidelines-2024",
    "title": "EV charging infrastructure guidelines",
    "issuer": "Ministry of Power",
    "date": "2024-09-17",
    "dateLabel": "Issued and effective",
    "status": "National guidelines",
    "area": "Demand & charging",
    "affected": [
      "Charging operators",
      "DISCOMs",
      "Charger suppliers",
      "EV fleets"
    ],
    "change": "The 2024 guidelines cover private and public charging. They provide an LT-connection option up to 150 kW, a tariff framework through March 2028 and arrangements for public land. Charging is delicensed subject to applicable standards.",
    "impact": "Power connections, site access and electricity cost influence where charging capacity is economical. That can affect fleet utilisation and the battery sizes or charging strategies buyers choose.",
    "limitation": "Local connection and safety requirements still apply. Delicensing is not exemption from all approvals, and these guidelines do not automatically grant PM E-DRIVE charger subsidies.",
    "sources": [
      {
        "title": "Ministry reply with original guidelines annexed",
        "url": "https://powermin.gov.in/sites/default/files/uploads/RS03022025_Eng_0.pdf",
        "date": "2025-02-03"
      }
    ],
    "checkedAt": "2026-09-06"
  },
  {
    "id": "customs-ev-machinery-2025",
    "title": "Customs relief for cell-manufacturing equipment",
    "issuer": "Ministry of Finance / Department of Revenue",
    "date": "2025-02-01",
    "dateLabel": "Notification issued",
    "status": "Customs amendment",
    "area": "Manufacturing",
    "affected": [
      "Factory equipment",
      "Cell makers",
      "Manufacturing projects"
    ],
    "change": "Budget 2025–26 announced exemption coverage for 35 additional capital goods for EV-battery manufacture and 28 for mobile-phone batteries. Notification 11/2025-Customs amended the specified machinery lists for lithium-ion cell production.",
    "impact": "Lower duties on qualifying imported equipment can reduce cell-project capital costs. They do not solve process know-how, production yield or customer qualification by themselves.",
    "limitation": "This concerns specified equipment and end uses, not every battery import or all factory expenditure. Tariff classification and notification conditions determine applicability; the date shown is the notification date.",
    "sources": [
      {
        "title": "Notification 11/2025-Customs",
        "url": "https://www.indiabudget.gov.in/budget2025-26/doc/cen/cus1125.pdf",
        "date": "2025-02-01"
      },
      {
        "title": "Budget announcement",
        "url": "https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=2098353&lang=2&reg=3",
        "date": "2025-02-01"
      }
    ],
    "checkedAt": "2026-09-06"
  },
  {
    "id": "customs-bess-machinery-2026",
    "title": "BESS cell machinery: customs exemption extended",
    "issuer": "Ministry of Finance / Department of Revenue",
    "date": "2026-02-02",
    "dateLabel": "Effective",
    "status": "Notified customs amendment",
    "area": "Materials & imports",
    "affected": [
      "Stationary-storage cells",
      "Factory equipment",
      "BESS developers"
    ],
    "change": "Notification 01/2026-Customs extends the specified cell-manufacturing machinery end-use provision to Battery Energy Storage Systems. The amendment was issued on 1 February and takes effect on 2 February 2026.",
    "impact": "Extending equipment treatment to stationary storage can improve the economics of domestic BESS-cell investment, alongside EV-cell manufacturing.",
    "limitation": "The exemption concerns specified cell-manufacturing capital goods. It does not make every imported BESS, battery pack or storage project duty-free, nor guarantee a consumer price reduction.",
    "sources": [
      {
        "title": "Notification 01/2026-Customs",
        "url": "https://www.indiabudget.gov.in/doc/cen/cus0126.pdf",
        "date": "2026-02-01"
      }
    ],
    "checkedAt": "2026-09-06"
  }
];
