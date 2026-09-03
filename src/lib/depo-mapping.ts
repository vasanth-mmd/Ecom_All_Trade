// City -> Del Location/Depo/State reference data, generated from Depo-Mapping.xlsx.
// The source sheet is keyed by a granular "Del Location" code (not present
// in the Trade FR raw data, which only has City), so this collapses to one
// entry per city using the most common Depo/State for that city. Chennai
// and Hyderabad each have one minority Del Location on a different depot
// (Ponneri -> "Sunethra Depo", Patancheru -> "Sudhiksha Depo") that gets
// folded into the majority depot here; "Del Location" below is one
// representative code from that majority group, not a per-PO fact.
// Keyed by normalized city name: trim + lowercase.

export type DepoEntry = { delLocation: string; depo: string; state: string };

export const CITY_DEPO_MAPPING: Record<string, DepoEntry> = {
  "mumbai": { delLocation: "MUM-DRY-MH-SHAKTI", depo: "Taloja Depo", state: "MAHARASTHRA" },
  "chennai": { delLocation: "CHN-DRY-MH2-THIRUVALLUR", depo: "Sunethra Depo - Chennai", state: "TAMIL NADU" },
  "hyderabad": { delLocation: "KTPL_HYD-COLD-MH-RAJABOLLARAM", depo: "Hyderabad Depo", state: "TELANGANA" },
  "pune": { delLocation: "KTPL_PUN-COLD-FMCG-MH-Perne", depo: "Pune Depo", state: "MAHARASTHRA" },
  "bengaluru": { delLocation: "KTPL_BLR-COLD-FMCG-MH-NELAMANGLA", depo: "HO Depo", state: "KARNATAKA" },
  "ahmedabad": { delLocation: "AHM-DRY-MH-KHEDA", depo: "Gujarat Depo", state: "GUJARAT" },
  "kochi": { delLocation: "KOC-Cold-MH-Matsypuri", depo: "Deneha Depo", state: "KERALA" },
  "bangalore": { delLocation: "KTPL_BLR-COLD-FMCG-MH-NELAMANGLA", depo: "HO Depo", state: "KARNATAKA" },
  "ahemdabad": { delLocation: "AHM-DRY-MH-KHEDA", depo: "Gujarat Depo", state: "GUJARAT" },
};

export function lookupDepoByCity(city: string): DepoEntry | null {
  return CITY_DEPO_MAPPING[city.trim().toLowerCase()] || null;
}

