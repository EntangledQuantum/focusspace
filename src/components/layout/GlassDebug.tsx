"use client";

import { useEffect } from "react";

/**
 * TEMP diagnostic: logs why `.glass` backdrop-filter may not render.
 * Prints CSS support, the resolved glass vars, and walks each `.glass`
 * element's ancestor chain looking for a property that creates a
 * "backdrop root" (which silently disables descendant backdrop-filter).
 * Also exposes window.__glassDebug() to re-run on demand.
 */
export function GlassDebug() {
  useEffect(() => {
    function run() {
      console.group("%c[glass-debug]", "color:#ff5fa2;font-weight:bold");
      console.log("CSS.supports backdrop-filter blur:", CSS.supports("backdrop-filter", "blur(10px)"));

      const rootCS = getComputedStyle(document.documentElement);
      console.log("--glass-blur:", JSON.stringify(rootCS.getPropertyValue("--glass-blur")));

      // Variant probe: which exact backdrop-filter values does THIS browser accept?
      const probe = document.createElement("div");
      document.body.appendChild(probe);
      const variants = [
        "blur(22px)",
        "blur(22px) saturate(1.4)",
        "blur(22px) saturate(140%)",
        "blur(var(--glass-blur))",
        "blur(var(--glass-blur)) saturate(1.4)",
        "blur(var(--glass-blur)) saturate(140%)",
      ];
      console.log("— backdrop-filter variant test (computed → '' means REJECTED) —");
      for (const v of variants) {
        probe.style.backdropFilter = "";
        probe.style.backdropFilter = v;
        const computed = getComputedStyle(probe).backdropFilter;
        const ok = computed && computed !== "none";
        console.log(`  ${ok ? "✅" : "❌"} "${v}" → "${computed}"`);
      }
      probe.remove();

      const glasses = Array.from(document.querySelectorAll<HTMLElement>(".glass"));
      glasses.slice(0, 2).forEach((el, idx) => {
        const cs = getComputedStyle(el);
        console.log(`.glass[${idx}] computed backdrop-filter:`, cs.backdropFilter || "(empty)");
      });
      console.groupEnd();
    }

    const id = setTimeout(run, 1200);
    (window as unknown as { __glassDebug: () => void }).__glassDebug = run;
    return () => clearTimeout(id);
  }, []);

  return null;
}
