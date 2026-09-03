/* Matches a raw SKU name (from either the trade "SKU Name" column or the
   canonical MMD name in mmd-mapping.ts, e.g. "Milky Mist Cheese- Slices - 1
   pack (200 g)" or "CHEESE SLICE 200GM") to one of the product photos in
   public/products/, by keyword. Order matters a lot here — specific terms
   (buttermilk, cream cheese, single origin, capella cone) are checked before
   the generic ones (cheese, cream, chocolate) they'd otherwise be swallowed
   by. Falls back to null (caller shows a neutral placeholder) rather than
   guessing wrong for the handful of SKUs we have no real photo for
   (e.g. shrikhand, rabadi, paan bararas). */
const RULES: { test: RegExp; src: string }[] = [
  // ---- drinks: buttermilk/lassi/milkshake, before the bare "butter"/"milk" rules.
  //      \blassi\b (not bare "lassi") because "lassi" is a substring of "CLASSIC". ----
  { test: /butter\s*milk|\bchaas\b|\blassi\b|milk\s*shake|milkshake|fusion shake/i, src: "/products/readytodrink.png" },

  // ---- Asal (rotis, batter, payasam) ----
  { test: /\bchapath?i\b/i, src: "/products/chapathi.png" },
  { test: /malabar\s*parota/i, src: "/products/parota-malabar.png" },
  { test: /coin\s*parota/i, src: "/products/parota-coin.png" },
  { test: /wheat\s*parota|whole\s*wheat\s*parota/i, src: "/products/parota-wheat.png" },
  { test: /\bparota\b/i, src: "/products/parota-malabar.png" },
  { test: /batter/i, src: "/products/batter.png" },
  { test: /payasam|kheer\s*&?\s*nuts|vermicelli|rice\s*palada/i, src: "/products/payasam.png" },
  { test: /mishti\s*doi/i, src: "/products/mishti-doi.png" },

  // ---- dairy staples (specific milk/dairy items before generic "milk") ----
  { test: /condensed|\bscm\b/i, src: "/products/condensed-milk.png" },
  { test: /milk\s*powder|whitener|whitner|\bkhova\b/i, src: "/products/food-enhancers.png" },
  // no bare \bcream\b fallback here — "ice-cream" and "cookies & cream" both
  // legitimately contain the standalone word "cream" but mean an ice cream
  // flavor, not the dairy cream product, so only match qualified forms.
  { test: /uht\s*cream|pure\s*cream|fresh\s*cream|milk\s*cream/i, src: "/products/cream.png" },
  { test: /paneer|tofu/i, src: "/products/paneer.png" },
  { test: /\bghee\b/i, src: "/products/ghee.png" },
  { test: /cheese|mozzarella/i, src: "/products/cheese.png" },
  { test: /\bcurd\b/i, src: "/products/curd.png" },
  { test: /skyr|greek/i, src: "/products/premium-yogurt.png" },
  { test: /yogh?urt/i, src: "/products/yogurt.png" },
  { test: /table\s*butter|cooking\s*butter|butter\s*chiplet/i, src: "/products/butter.png" },

  // ---- chocolate bars (before ice-cream flavor words, since both use "chocolate") ----
  { test: /single\s*origin|compound\s*chocolate/i, src: "/products/dark-chocolate.png" },
  { test: /dark\s*chocolate/i, src: "/products/dark-chocolate.png" },
  { test: /milk\s*chocolate|chocolate\s*gift\s*box/i, src: "/products/chocolate.png" },

  // ---- ice cream, matched by flavor (checked only after chocolate-bar rules above) ----
  { test: /mango/i, src: "/products/ic-mango.png" },
  { test: /litchi|litichi/i, src: "/products/ic-litchi.png" },
  { test: /orange/i, src: "/products/ic-orange.png" },
  { test: /strawberry|straberry/i, src: "/products/ic-strawberry.png" },
  { test: /black\s*currant/i, src: "/products/ic-blackcurrant.png" },
  { test: /coconut/i, src: "/products/ic-coconut.png" },
  { test: /cookies?\s*(&|o|and)?\s*cream|cookies?\s*cream/i, src: "/products/ic-cookiescream.png" },
  { test: /dulce\s*de\s*leche|caramel/i, src: "/products/ic-dulcedeleche.png" },
  { test: /almond|badam|pista/i, src: "/products/ic-almond.png" },
  { test: /jackfruit/i, src: "/products/ic-jackfruit.png" },
  { test: /kheer|rabadi|rajbhog/i, src: "/products/ic-kheer.png" },
  { test: /butter\s*scotch/i, src: "/products/ic-butterscotch.png" },
  { test: /vanilla/i, src: "/products/ic-vanilla.png" },
  { test: /chocolate/i, src: "/products/ic-chocolate.png" },
  // ---- generic milk: after every specific flavor/format rule above (so it
  //      never shadows e.g. "RABADI AND MILK CAKE"), but before the vague
  //      ice-cream catch-all below (so "DTM UHT MILK 500 ML" doesn't get
  //      mistaken for an unrecognised ice cream just because it has "...ml"). ----
  { test: /\bmilk\b/i, src: "/products/uht-milk.png" },

  {
    // anything else that's clearly an ice cream by its pack format, even if
    // the specific flavor wasn't recognised above (cassata, sandwiches, etc.)
    test: /\d+\s*ml\b|capella|kulfi|sandwich|sundae|sorbet|cassata|\bcone\b|\btub\b/i,
    src: "/products/ic-vanilla.png",
  },
];

export function matchSkuIcon(name: string): string | null {
  for (const rule of RULES) if (rule.test.test(name)) return rule.src;
  return null;
}
