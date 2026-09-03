/* Vanilla-JS port of src/lib/sku-icon.ts — keep the two in sync. Matches a
   canonical MMD SKU name to a product photo in public/products/ by keyword.
   See sku-icon.ts for the full rule-ordering rationale. */
(function () {
  var RULES = [
    { test: /butter\s*milk|\bchaas\b|\blassi\b|milk\s*shake|milkshake|fusion shake/i, src: "/products/readytodrink.png" },
    { test: /\bchapath?i\b/i, src: "/products/chapathi.png" },
    { test: /malabar\s*parota/i, src: "/products/parota-malabar.png" },
    { test: /coin\s*parota/i, src: "/products/parota-coin.png" },
    { test: /wheat\s*parota|whole\s*wheat\s*parota/i, src: "/products/parota-wheat.png" },
    { test: /\bparota\b/i, src: "/products/parota-malabar.png" },
    { test: /batter/i, src: "/products/batter.png" },
    { test: /payasam|kheer\s*&?\s*nuts|vermicelli|rice\s*palada/i, src: "/products/payasam.png" },
    { test: /mishti\s*doi/i, src: "/products/mishti-doi.png" },
    { test: /condensed|\bscm\b/i, src: "/products/condensed-milk.png" },
    { test: /milk\s*powder|whitener|whitner|\bkhova\b/i, src: "/products/food-enhancers.png" },
    { test: /uht\s*cream|pure\s*cream|fresh\s*cream|milk\s*cream/i, src: "/products/cream.png" },
    { test: /paneer|tofu/i, src: "/products/paneer.png" },
    { test: /\bghee\b/i, src: "/products/ghee.png" },
    { test: /cheese|mozzarella/i, src: "/products/cheese.png" },
    { test: /\bcurd\b/i, src: "/products/curd.png" },
    { test: /skyr|greek/i, src: "/products/premium-yogurt.png" },
    { test: /yogh?urt/i, src: "/products/yogurt.png" },
    { test: /table\s*butter|cooking\s*butter|butter\s*chiplet/i, src: "/products/butter.png" },
    { test: /single\s*origin|compound\s*chocolate/i, src: "/products/dark-chocolate.png" },
    { test: /dark\s*chocolate/i, src: "/products/dark-chocolate.png" },
    { test: /milk\s*chocolate|chocolate\s*gift\s*box/i, src: "/products/chocolate.png" },
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
    { test: /\bmilk\b/i, src: "/products/uht-milk.png" },
    { test: /\d+\s*ml\b|capella|kulfi|sandwich|sundae|sorbet|cassata|\bcone\b|\btub\b/i, src: "/products/ic-vanilla.png" },
  ];

  window.matchSkuIcon = function (name) {
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i].test.test(name)) return RULES[i].src;
    }
    return null;
  };
})();
