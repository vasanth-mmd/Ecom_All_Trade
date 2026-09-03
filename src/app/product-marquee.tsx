"use client";

import { useEffect, useState } from "react";

/* Official Milky Mist product shots, scrolling in an infinite loop — same
   marquee technique as the trade-name ticker further down the homepage. */
type Product = { src: string; name: string; desc: string };

const PRODUCTS: Product[] = [
  { src: "/products/uht-milk.png", name: "Milk", desc: "UHT toned & full-cream milk — long shelf life, no refrigeration needed till opened." },
  { src: "/products/ghee.png", name: "Ghee", desc: "Pure cow ghee, traditionally simmered for rich aroma and taste." },
  { src: "/products/paneer.png", name: "Paneer", desc: "Fresh, soft paneer blocks — high in protein, no preservatives." },
  { src: "/products/cheese.png", name: "Cheese", desc: "Mozzarella, cheese cubes and slices for everyday cooking and snacking." },
  { src: "/products/butter.png", name: "Butter", desc: "Table butter churned from fresh cream — salted and unsalted." },
  { src: "/products/curd.png", name: "Curd", desc: "Thick, traditionally set curd with a naturally creamy texture." },
  { src: "/products/yogurt.png", name: "Yogurt", desc: "Fruit & premium yogurt cups in a range of flavours." },
  { src: "/products/readytodrink.png", name: "Milkshake & Lassi", desc: "Ready-to-drink milkshakes and lassi, chilled and ready to enjoy." },
  { src: "/products/condensed-milk.png", name: "Condensed Milk", desc: "Sweetened condensed milk, perfect for desserts and beverages." },
  { src: "/products/premium-yogurt.png", name: "Greek Yogurt", desc: "Probiotic Greek yogurt with 7g protein — Honey & Fig and more flavours." },
  { src: "/products/food-enhancers.png", name: "Milk Powder & Whitener", desc: "Skimmed milk powder, dairy whitener and khova for everyday cooking." },
  { src: "/products/chapathi.png", name: "Chapati", desc: "Half-cooked wheat chapati — heat and eat." },
  { src: "/products/parota-malabar.png", name: "Malabar Parota", desc: "Layered, flaky Kerala-style parota." },
  { src: "/products/batter.png", name: "Idly & Dosa Batter", desc: "Ready-to-cook fermented idly & dosa batter." },
  { src: "/products/payasam.png", name: "Payasam Mix", desc: "Vermicelli payasam mix for a quick festive dessert." },
  { src: "/products/mishti-doi.png", name: "Mishti Doi", desc: "Traditional West Bengal sweetened set curd." },
  { src: "/products/chocolate.png", name: "Capella Chocolate", desc: "Milk chocolate made from finest cocoa beans." },
  { src: "/products/cream.png", name: "UHT Cream", desc: "Shelf-stable milk cream for cooking, baking and beverages." },
  { src: "/products/ic-vanilla.png", name: "Ice Cream", desc: "A range of tub, cup, cone and bar ice creams in every flavour." },
];

const AUTO_CLOSE_MS = 10_000;

export default function ProductMarquee() {
  const [popup, setPopup] = useState<{ p: Product; x: number; y: number } | null>(null);
  const items = [...PRODUCTS, ...PRODUCTS];

  useEffect(() => {
    if (!popup) return;
    const t = setTimeout(() => setPopup(null), AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [popup]);

  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
      <div
        className="animate-marquee-slow flex items-start gap-4 sm:gap-5 w-max py-3"
        style={popup ? { animationPlayState: "paused" } : undefined}
      >
        {items.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => setPopup({ p, x: e.clientX, y: e.clientY })}
            className="group shrink-0 w-28 sm:w-32 text-center cursor-pointer focus:outline-none transition-transform duration-300 hover:-translate-y-1.5"
          >
            <div className="w-28 sm:w-32 h-28 sm:h-32 rounded-3xl bg-white/95 border border-purple-100/80 shadow-md shadow-purple-950/5 grid place-items-center p-3 backdrop-blur-xl transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl group-hover:shadow-purple-500/20 group-hover:border-purple-300/90 group-hover:bg-white relative overflow-hidden">
              {/* Subtle glossy top specular highlight */}
              <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/80 to-transparent pointer-events-none rounded-t-3xl" />
              
              {/* Product Image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.src}
                alt={p.name}
                className="max-h-full max-w-full object-contain filter drop-shadow-sm group-hover:drop-shadow-md group-hover:scale-105 transition-all duration-300 relative z-10"
              />
            </div>
            <div className="mt-2.5 px-2 py-0.5 rounded-full bg-white/70 backdrop-blur-xs border border-purple-100/60 shadow-2xs text-[11px] font-bold text-purple-950 group-hover:text-purple-700 group-hover:border-purple-200 transition-colors truncate">
              {p.name}
            </div>
          </button>
        ))}
      </div>

      {popup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPopup(null)} />
          <div
            className="fixed z-50 w-72 rounded-3xl bg-white/95 backdrop-blur-2xl border border-purple-200/90 shadow-2xl shadow-purple-950/20 p-5 text-left animate-in fade-in zoom-in-95 duration-150"
            style={{
              left: Math.min(
                Math.max(popup.x - 130, 12),
                (typeof window !== "undefined" ? window.innerWidth : 1000) - 300
              ),
              top: Math.max(popup.y - 170, 12),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-purple-100 pb-2 mb-2">
              <span className="text-base font-black text-purple-950 bg-gradient-to-r from-purple-950 via-purple-900 to-fuchsia-950 bg-clip-text text-transparent">
                {popup.p.name}
              </span>
              <span className="text-xs text-purple-400 font-bold">Milky Mist</span>
            </div>
            <p className="text-xs font-medium text-slate-600 leading-relaxed">{popup.p.desc}</p>
          </div>
        </>
      )}
    </div>
  );
}
