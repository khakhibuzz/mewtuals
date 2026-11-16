import type { BatteryResearchRecord } from "../domain/battery-research";
export { batteryResearchSources } from "./battery-research-sources";

export const batteryResearchCheckedAt = "2026-09-06";

export const indiaBatteryRecords: readonly BatteryResearchRecord[] = [
  {
    "id": "reasi",
    "name": "GSI · Salal-Haimna resource",
    "locality": "Reasi district, Jammu and Kashmir",
    "stateKey": "jammu_and_kashmir",
    "stageIds": [
      "materials"
    ],
    "status": "exploration",
    "summary": "GSI identified an inferred lithium-bearing ore resource in Reasi. This is an exploration result, not a producing lithium mine or battery-grade supply.",
    "statusNote": "The July 2023 report classifies the resource as G3. March 2026 evidence still discusses exploration; commercial mine output is not established here.",
    "applications": [
      "Lithium-bearing ore"
    ],
    "sourceIds": [
      "gsi-resource",
      "gsi-update"
    ],
    "location": {
      "label": "Reasi district reference",
      "latitude": 33.08115,
      "longitude": 74.83242,
      "geonamesId": "1258167"
    },
    "locationNote": "Marker shows the named town or district reference, not the facility entrance or boundary.",
    "roles": [
      "materials"
    ],
    "facts": {}
  },
  {
    "id": "kabil",
    "name": "KABIL · overseas lithium access",
    "locality": "Catamarca, Argentina · Indian public-sector venture",
    "stateKey": null,
    "stageIds": [
      "materials"
    ],
    "status": "exploration",
    "summary": "KABIL is developing overseas lithium access through Argentine brine blocks. Government reporting records completion of Phase II drilling.",
    "statusNote": "August 2026 drilling progress does not establish commercial output or confirmed shipments to India.",
    "applications": [
      "Lithium brine"
    ],
    "sourceIds": [
      "kabil"
    ],
    "location": null,
    "locationNote": "Overseas exploration project. Deliberately not pinned inside India.",
    "roles": [
      "materials"
    ],
    "facts": {}
  },
  {
    "id": "epsilon",
    "name": "Epsilon · EAM-ONE",
    "locality": "Vijayanagar / Ballari region, Karnataka",
    "stateKey": "karnataka",
    "stageIds": [
      "components"
    ],
    "status": "qualification",
    "summary": "EAM-ONE produces graphite anode material for customer qualification. Epsilon is progressing a larger commercial expansion.",
    "statusNote": "The August 2026 release targets 30,000 tonnes/year in 2028. That future scale is separate from the commissioned qualification plant.",
    "applications": [
      "Graphite anode material"
    ],
    "sourceIds": [
      "epsilon"
    ],
    "location": {
      "label": "Ballari district reference",
      "latitude": 15.14205,
      "longitude": 76.92398,
      "geonamesId": "1276509"
    },
    "locationNote": "Marker shows the named town or district reference, not the facility entrance or boundary.",
    "roles": [
      "materials"
    ],
    "facts": {
      "capacity": {
        "value": "30,000 tonnes/year expansion target for 2028. Not current operating capacity.",
        "sourceIds": [
          "epsilon"
        ]
      }
    }
  },
  {
    "id": "neogen-dahej",
    "name": "Neogen Ionics · Dahej",
    "locality": "Dahej, Gujarat",
    "stateKey": "gujarat",
    "stageIds": [
      "components"
    ],
    "status": "commissioned",
    "summary": "Neogen reported commissioned electrolyte capacity at Dahej. Its later disclosure describes trials and customer validation for expansion.",
    "statusNote": "Existing Dahej capacity and the expansion are different milestones. Pakhajan salt production was a future target in the July 2026 call.",
    "applications": [
      "Electrolytes",
      "Electrolyte salts"
    ],
    "sourceIds": [
      "neogen-existing",
      "neogen-update"
    ],
    "location": {
      "label": "Dahej town reference",
      "latitude": 21.7119,
      "longitude": 72.59113,
      "geonamesId": "1273703"
    },
    "locationNote": "Marker shows the named town or district reference, not the facility entrance or boundary.",
    "roles": [
      "materials"
    ],
    "facts": {}
  },
  {
    "id": "himadri-anode",
    "name": "Himadri · Mahistikry anode plant",
    "locality": "Mahistikry, West Bengal",
    "stateKey": "west_bengal",
    "stageIds": [
      "components"
    ],
    "status": "commissioned",
    "summary": "Himadri reported commissioning a 200-tonne/year anode-material facility in April 2026.",
    "statusNote": "Commissioning is a plant milestone. The July 2026 release does not establish utilisation or actual annual output at nameplate capacity.",
    "applications": [
      "Anode material"
    ],
    "sourceIds": [
      "himadri"
    ],
    "location": null,
    "locationNote": "Mahistikry is identified in the filing. A reliable locality coordinate has not been resolved; no pin is shown.",
    "roles": [
      "materials"
    ],
    "facts": {
      "capacity": {
        "value": "200 tonnes/year nameplate anode material capacity commissioned April 2026; actual output and utilisation not disclosed here.",
        "sourceIds": [
          "himadri"
        ]
      }
    }
  },
  {
    "id": "himadri-lfp",
    "name": "Himadri · LFP cathode programme",
    "locality": "India · site not resolved in the dated release",
    "stateKey": null,
    "stageIds": [
      "components"
    ],
    "status": "planned",
    "summary": "Himadri is developing lithium iron phosphate cathode material capacity, with a smaller commercial line preceding a larger phased programme.",
    "statusNote": "The July 2026 release targets a 2,000-tonne/year line in Q3 FY27. Its larger 40,000 / 200,000-tonne ambitions are separate future phases.",
    "applications": [
      "LFP cathode material"
    ],
    "sourceIds": [
      "himadri"
    ],
    "location": null,
    "locationNote": "The dated release does not locate the smaller line. No factory coordinate is inferred from the larger programme.",
    "roles": [
      "materials"
    ],
    "facts": {
      "chemistry": {
        "value": "LFP cathode material programme.",
        "sourceIds": [
          "himadri"
        ]
      }
    }
  },
  {
    "id": "ola-cells",
    "name": "Ola · Gigafactory",
    "locality": "Pochampalli, Krishnagiri, Tamil Nadu",
    "stateKey": "tamil_nadu",
    "stageIds": [
      "cells",
      "packs",
      "applications"
    ],
    "status": "operating",
    "summary": "Ola manufactures 4680 Bharat cells for its electric vehicles. It announced mass deliveries of the S1 Pro+ using its own cells and packs in December 2025.",
    "statusNote": "Commercial use is evidenced by the dated delivery announcement. No current total GWh is asserted; 4680 describes cell format, not chemistry.",
    "applications": [
      "Electric two-wheelers"
    ],
    "sourceIds": [
      "ola",
      "ola-location"
    ],
    "location": {
      "label": "Pochampalli town reference",
      "latitude": 12.33279,
      "longitude": 78.3678,
      "geonamesId": "8223992"
    },
    "locationNote": "Marker shows the named town or district reference, not the facility entrance or boundary.",
    "relationship": "Ola cells → Ola packs → S1 Pro+ electric scooters: in-house integration described in the delivery announcement.",
    "roles": [
      "cells",
      "packs",
      "applications"
    ],
    "facts": {
      "customers": {
        "value": "Ola cells → Ola packs → S1 Pro+ electric scooters: in-house integration described in the delivery announcement.",
        "sourceIds": [
          "ola",
          "ola-location"
        ]
      },
      "cellOrigin": {
        "value": "In-house Indian cell manufacture for the S1 Pro+ delivery announced in December 2025. Upstream mineral and component origins are not established.",
        "sourceIds": [
          "ola",
          "ola-location"
        ]
      }
    }
  },
  {
    "id": "exide-cells",
    "name": "Exide Energy · Bengaluru cells",
    "locality": "Devanahalli, Bengaluru Rural, Karnataka",
    "stateKey": "karnataka",
    "stageIds": [
      "cells"
    ],
    "status": "qualification",
    "summary": "Exide is commissioning lithium-ion cell production at Devanahalli. Its May 2026 call described validation and customer-sample trials.",
    "statusNote": "The cited May call explicitly said cell supplies had not started. Later commercial commencement is not verified in this research.",
    "applications": [
      "EV cells",
      "Stationary storage cells"
    ],
    "sourceIds": [
      "exide-cells",
      "exide-location"
    ],
    "location": {
      "label": "Devanahalli town reference",
      "latitude": 13.24655,
      "longitude": 77.71183,
      "geonamesId": "1273123"
    },
    "locationNote": "Marker shows the named town or district reference, not the facility entrance or boundary.",
    "roles": [
      "cells"
    ],
    "facts": {}
  },
  {
    "id": "exide-packs",
    "name": "Exide Energy · Prantij packs",
    "locality": "Kamalpur / Prantij, Gujarat",
    "stateKey": "gujarat",
    "stageIds": [
      "packs"
    ],
    "status": "operating",
    "summary": "Exide’s Prantij facility manufactures lithium-ion modules and battery packs for electric vehicles, telecom and energy storage.",
    "statusNote": "Pack assembly is distinct from Exide’s developing Bengaluru cell operation. May 2026 company material identifies the Prantij manufacturing business.",
    "applications": [
      "Electric vehicles",
      "Telecom",
      "Energy storage"
    ],
    "sourceIds": [
      "exide-packs",
      "exide-location"
    ],
    "location": {
      "label": "Prantij town reference",
      "latitude": 23.43605,
      "longitude": 72.84479,
      "geonamesId": "8541964"
    },
    "locationNote": "Marker shows the named town or district reference, not the facility entrance or boundary.",
    "roles": [
      "packs"
    ],
    "facts": {}
  },
  {
    "id": "amara-packs",
    "name": "Amara Raja · Divitipally packs",
    "locality": "Divitipally, Mahabubnagar, Telangana",
    "stateKey": "telangana",
    "stageIds": [
      "packs"
    ],
    "status": "operating",
    "summary": "Amara Raja inaugurated its Divitipally mobility battery-pack plant in August 2024. A later presentation identifies the operating pack assembly facility.",
    "statusNote": "This record covers packs. The adjacent cell qualification and future gigafactory programmes are not counted as operating commercial cell capacity.",
    "applications": [
      "Electric two-wheelers",
      "Electric three-wheelers"
    ],
    "sourceIds": [
      "amara",
      "amara-update",
      "amara-products"
    ],
    "location": {
      "label": "Mahabubnagar district reference",
      "latitude": 16.74385,
      "longitude": 77.98597,
      "geonamesId": "1264407"
    },
    "locationNote": "Marker shows the named town or district reference, not the facility entrance or boundary.",
    "roles": [
      "packs"
    ],
    "facts": {
      "chemistry": {
        "value": "Company portfolio includes NMC and LFP two-/three-wheeler packs. This does not assign every SKU to Divitipally.",
        "sourceIds": [
          "amara-products"
        ]
      }
    }
  },
  {
    "id": "tdsg",
    "name": "TDSG · hybrid batteries",
    "locality": "Hansalpur / Becharaji, Gujarat",
    "stateKey": "gujarat",
    "stageIds": [
      "cells",
      "packs",
      "applications"
    ],
    "status": "operating",
    "summary": "TDSG produces lithium-ion batteries for hybrid vehicles with cell-level manufacturing in India. Suzuki reported strong-hybrid battery production in August 2025.",
    "statusNote": "Mild-hybrid production began in 2021. The strong-hybrid batteries described here must not be confused with e VITARA battery-electric vehicle packs.",
    "applications": [
      "Hybrid passenger cars"
    ],
    "sourceIds": [
      "tdsg",
      "tdsg-location"
    ],
    "location": {
      "label": "Becharaji town reference",
      "latitude": 23.49938,
      "longitude": 72.04469,
      "geonamesId": "12518923"
    },
    "locationNote": "Marker shows the named town or district reference, not the facility entrance or boundary.",
    "relationship": "TDSG batteries → Suzuki Grand Vitara strong hybrids, as identified in Suzuki’s August 2025 release.",
    "roles": [
      "cells",
      "packs",
      "applications"
    ],
    "facts": {
      "customers": {
        "value": "TDSG batteries → Suzuki Grand Vitara strong hybrids, as identified in Suzuki’s August 2025 release.",
        "sourceIds": [
          "tdsg",
          "tdsg-location"
        ]
      }
    }
  },
  {
    "id": "agratas-sanand",
    "name": "Agratas · Sanand facility",
    "locality": "Sanand, Gujarat",
    "stateKey": "gujarat",
    "stageIds": [
      "cells"
    ],
    "status": "planned",
    "summary": "Agratas is building its Sanand battery facility. Its August 2026 update described continuing construction and approaching equipment installation.",
    "statusNote": "Production launch was targeted for 2027. Planned manufacturing capacity is not operating production.",
    "applications": [
      "Battery manufacturing"
    ],
    "sourceIds": [
      "agratas"
    ],
    "location": {
      "label": "Sanand town reference",
      "latitude": 22.99227,
      "longitude": 72.38177,
      "geonamesId": "1257486"
    },
    "locationNote": "Marker shows the named town or district reference, not the facility entrance or boundary.",
    "roles": [
      "cells"
    ],
    "facts": {}
  },
  {
    "id": "attero",
    "name": "Attero · Roorkee recycling",
    "locality": "Roorkee, Uttarakhand",
    "stateKey": "uttarakhand",
    "stageIds": [
      "recycling"
    ],
    "status": "operating",
    "summary": "Attero operates a lithium-ion and e-waste recycling plant in Roorkee. Mahindra Last Mile Mobility announced a recycling collaboration in December 2023.",
    "statusNote": "The dated source establishes the plant and collaboration, not quantities already processed or current nameplate capacity.",
    "applications": [
      "EV battery recycling"
    ],
    "sourceIds": [
      "attero"
    ],
    "location": {
      "label": "Roorkee town reference",
      "latitude": 29.86632,
      "longitude": 77.89118,
      "geonamesId": "1258044"
    },
    "locationNote": "Marker shows the named town or district reference, not the facility entrance or boundary.",
    "relationship": "Mahindra Last Mile Mobility → Attero: recycling collaboration announced in December 2023; processed volumes not established.",
    "roles": [
      "recycling"
    ],
    "facts": {
      "customers": {
        "value": "Mahindra Last Mile Mobility → Attero: recycling collaboration announced in December 2023; processed volumes not established.",
        "sourceIds": [
          "attero"
        ]
      }
    }
  },
  {
    "id": "batx",
    "name": "BatX · HUB-1",
    "locality": "Sikandrabad, Bulandshahr, Uttar Pradesh",
    "stateKey": "uttar_pradesh",
    "stageIds": [
      "refining",
      "recycling"
    ],
    "status": "operating",
    "summary": "BatX identifies HUB-1 as its commercial battery recycling and hydrometallurgical refining plant in Sikandrabad.",
    "statusNote": "Company-reported operations on an undated page checked in September 2026. Gurugram headquarters is a separate location, not this plant.",
    "applications": [
      "Battery recycling",
      "Recovered critical minerals"
    ],
    "sourceIds": [
      "batx"
    ],
    "location": {
      "label": "Sikandrabad town reference",
      "latitude": 28.45226,
      "longitude": 77.70004,
      "geonamesId": "1256329"
    },
    "locationNote": "Marker shows the named town or district reference, not the facility entrance or boundary.",
    "roles": [
      "recycling",
      "materials"
    ],
    "facts": {}
  },
  {
    "id": "lohum",
    "name": "LOHUM · Greater Noida operations",
    "locality": "Greater Noida, Uttar Pradesh",
    "stateKey": "uttar_pradesh",
    "stageIds": [
      "refining",
      "recycling"
    ],
    "status": "operating",
    "summary": "LOHUM identifies battery recycling, lithium refining and cobalt refining facilities across Greater Noida. A May 2026 government-broadcaster report corroborates industrial activity there.",
    "statusNote": "This record represents several industrial sites. It does not assign every operation to one factory or claim minerals came from an Indian mine.",
    "applications": [
      "Battery recycling",
      "Recovered lithium and cobalt"
    ],
    "sourceIds": [
      "lohum",
      "lohum-gov"
    ],
    "location": {
      "label": "Greater Noida city reference",
      "latitude": 28.49615,
      "longitude": 77.53601,
      "geonamesId": "6954929"
    },
    "locationNote": "City-level marker for multiple reported industrial facilities, not one exact factory.",
    "roles": [
      "recycling",
      "materials"
    ],
    "facts": {}
  },
  {
    "id": "hyundai-exide",
    "name": "Hyundai–Exide · cell agreement",
    "locality": "India-market supply relationship",
    "stateKey": null,
    "stageIds": [
      "applications"
    ],
    "status": "agreement",
    "summary": "Hyundai and Exide announced battery localisation cooperation, followed by a binding term sheet for Indian EV cell production and supply.",
    "statusNote": "The April 2024 Hyundai/Kia announcement names LFP cells. The December term sheet concerns future definitive agreements, not completed cell deliveries.",
    "applications": [
      "Passenger electric cars"
    ],
    "sourceIds": [
      "hyundai-mou",
      "hyundai-terms"
    ],
    "location": null,
    "locationNote": "An agreement is not a facility. Neither a headquarters pin nor a physical delivery route is inferred.",
    "relationship": "Exide Energy Solutions → Hyundai Motor India: binding term sheet, December 2024. Kia is named in the earlier MoU.",
    "roles": [
      "applications"
    ],
    "facts": {
      "customers": {
        "value": "Exide Energy Solutions → Hyundai Motor India: binding term sheet, December 2024. Kia is named in the earlier MoU.",
        "sourceIds": [
          "hyundai-mou",
          "hyundai-terms"
        ]
      },
      "chemistry": {
        "value": "LFP in the April 2024 localisation MoU; future supply agreement, not delivered cells.",
        "sourceIds": [
          "hyundai-mou"
        ]
      }
    }
  },
  {
    "id": "eplane",
    "name": "ePlane · e200X development",
    "locality": "IIT Madras Thaiyur campus, Tamil Nadu",
    "stateKey": "tamil_nadu",
    "stageIds": [
      "applications"
    ],
    "status": "development",
    "summary": "ePlane develops the battery-electric e200X and identifies a manufacturing facility at IIT Madras’s Thaiyur campus.",
    "statusNote": "Company material describes prototypes and ongoing type certification. Design approval is not certified commercial passenger service. Battery chemistry and cell supplier are not established here.",
    "applications": [
      "Electric aircraft / eVTOL"
    ],
    "sourceIds": [
      "eplane",
      "eplane-battery"
    ],
    "location": {
      "label": "Thaiyur locality reference",
      "latitude": 12.77434,
      "longitude": 80.19419,
      "geonamesId": "1255233"
    },
    "locationNote": "Marker shows the named town or district reference, not the facility entrance or boundary.",
    "roles": [
      "applications"
    ],
    "facts": {}
  },
  {
    "id": "addverb-elixis",
    "name": "Addverb · Elixis humanoids",
    "locality": "India · no verified battery manufacturing site",
    "stateKey": null,
    "stageIds": [
      "applications"
    ],
    "status": "development",
    "summary": "Addverb publishes battery-backup targets for Elixis humanoids and describes limited, supervised Elixis-W proof-of-concept deployments.",
    "statusNote": "This establishes a battery-powered robot application. The reviewed sources do not identify battery chemistry, capacity or a named Indian cell/pack supplier.",
    "applications": [
      "Humanoid robots"
    ],
    "sourceIds": [
      "addverb",
      "addverb-launch"
    ],
    "location": null,
    "locationNote": "Product evidence only. No dedicated humanoid or battery factory location is established by these sources.",
    "roles": [
      "applications"
    ],
    "facts": {}
  },
  {
    "id": "vecmocon",
    "name": "Vecmocon · BMS & chargers",
    "locality": "Noida, Uttar Pradesh · headquarters",
    "stateKey": "uttar_pradesh",
    "stageIds": [
      "components"
    ],
    "status": "operating",
    "summary": "Vecmocon designs battery-management systems and charger electronics for electric vehicles and storage. Its documented BMS portfolio includes 16S, 24S and high-voltage boards.",
    "statusNote": "Product and support documentation establish the offering. No manufacturing site or annual factory capacity is verified. The charger page lists 1,400 W; a different homepage figure requires model confirmation.",
    "applications": [
      "BMS",
      "Chargers",
      "Two- and three-wheelers",
      "Stationary storage"
    ],
    "sourceIds": [
      "vec-bms",
      "vec-charger",
      "vec-contact",
      "vec-boards"
    ],
    "location": null,
    "locationNote": "Noida is explicitly the headquarters. No factory marker is inferred from an office address.",
    "roles": [
      "bms",
      "chargers"
    ],
    "reviewedAt": "2026-09-06",
    "facts": {
      "chemistry": {
        "value": "BMS page describes chemistry-agnostic configuration and gives LFP / NMC voltage examples for one 17-series model. Confirm the exact board and firmware.",
        "sourceIds": [
          "vec-bms"
        ]
      },
      "certifications": {
        "value": "Charger page claims AIS156 compliance without a certificate identifier or defined scope. Certificate not independently verified; this is not proof of a certified battery pack.",
        "sourceIds": [
          "vec-charger"
        ]
      }
    }
  },
  {
    "id": "exicom-hyderabad",
    "name": "Exicom · Hyderabad systems",
    "locality": "Hyderabad region, Telangana · integrated facility",
    "stateKey": "telangana",
    "stageIds": [
      "components",
      "packs"
    ],
    "status": "commissioned",
    "summary": "Exicom inaugurated an integrated plant for EV chargers, lithium-ion battery systems and critical power in March 2026. Its Harmony Direct 2.0 product range includes DC chargers up to 240 kW.",
    "statusNote": "Inauguration and company product range are evidenced separately; the sources do not assign every charger SKU to this plant. Conflicting capacity multipliers are excluded. A testing centre described in the announcement was planned.",
    "applications": [
      "EV chargers",
      "Lithium-ion systems",
      "Critical power"
    ],
    "sourceIds": [
      "exicom-plant",
      "exicom-charger"
    ],
    "location": null,
    "locationNote": "Hyderabad region is reported. An independently resolved factory locality is not yet available; no city-centre factory pin is used.",
    "roles": [
      "chargers",
      "packs"
    ],
    "reviewedAt": "2026-09-06",
    "facts": {
      "capacity": {
        "value": "Annual factory production not established. Charger output ratings of 60–240 kW describe product power, not factory capacity.",
        "sourceIds": [
          "exicom-charger"
        ]
      },
      "certifications": {
        "value": "Company reports site IATF 16949 and ISO 9001:2015 / 14001:2015 / 45001:2018 certification. These are management-system claims, not certificates for every charger or battery product.",
        "sourceIds": [
          "exicom-plant"
        ]
      }
    }
  },
  {
    "id": "greenfuel-eve",
    "name": "Greenfuel–EVE · cell sourcing",
    "locality": "India-facing supply relationship · location unverified",
    "stateKey": null,
    "stageIds": [
      "packs"
    ],
    "status": "agreement",
    "summary": "A February 2024 Greenfuel announcement identifies EVE Energy as a lithium-cell partner for Indian battery packs. It names pouch, prismatic and cylindrical formats.",
    "statusNote": "Historical sourcing agreement; current shipments, importer of record and battery-business legal continuity need confirmation. The separate noco-noco MoU contemplated supply, not delivered volume.",
    "applications": [
      "Imported-cell sourcing",
      "Battery packs"
    ],
    "sourceIds": [
      "greenfuel-eve",
      "greenfuel-noco"
    ],
    "location": null,
    "locationNote": "No current battery plant is verified. The gas-business address is not used as a battery factory location.",
    "roles": [
      "packs",
      "bms"
    ],
    "reviewedAt": "2026-09-06",
    "facts": {
      "cellOrigin": {
        "value": "Named external cell partner: EVE Energy (China), per February 2024 announcement. No shipment-level origin, current purchasing volume or customs importer is established.",
        "sourceIds": [
          "greenfuel-eve"
        ]
      },
      "chemistry": {
        "value": "Partnership release describes EVE NCM and LFP systems. It does not establish chemistry for every Greenfuel pack.",
        "sourceIds": [
          "greenfuel-eve"
        ]
      },
      "capacity": {
        "value": "The January 2024 noco-noco MoU contemplated 3 MWh per quarter of cell supply. This is a proposed supply volume, not factory capacity or delivered imports.",
        "sourceIds": [
          "greenfuel-noco"
        ]
      }
    }
  }
];
