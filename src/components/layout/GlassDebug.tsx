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
    const BACKDROP_ROOT_TRIGGERS = (cs: CSSStyleDeclaration) => {
      const reasons: string[] = [];
      if (cs.transform && cs.transform !== "none") reasons.push(`transform:${cs.transform}`);
      if (cs.filter && cs.filter !== "none") reasons.push(`filter:${cs.filter}`);
      if (cs.backdropFilter && cs.backdropFilter !== "none") reasons.push(`backdrop-filter:${cs.backdropFilter}`);
      if (cs.perspective && cs.perspective !== "none") reasons.push(`perspective:${cs.perspective}`);
      if (cs.opacity && cs.opacity !== "1") reasons.push(`opacity:${cs.opacity}`);
      if (cs.mixBlendMode && cs.mixBlendMode !== "normal") reasons.push(`mix-blend-mode:${cs.mixBlendMode}`);
      if (cs.isolation === "isolate") reasons.push("isolation:isolate");
      if (cs.contain && !["none", "normal"].includes(cs.contain)) reasons.push(`contain:${cs.contain}`);
      if (cs.willChange && cs.willChange !== "auto") reasons.push(`will-change:${cs.willChange}`);
      if (cs.maskImage && cs.maskImage !== "none") reasons.push(`mask:${cs.maskImage}`);
      return reasons;
    };

    function run() {
      console.group("%c[glass-debug]", "color:#ff5fa2;font-weight:bold");
      console.log("CSS.supports backdrop-filter blur:", CSS.supports("backdrop-filter", "blur(10px)"));
      console.log("CSS.supports -webkit-backdrop-filter blur:", CSS.supports("-webkit-backdrop-filter", "blur(10px)"));

      const rootCS = getComputedStyle(document.documentElement);
      console.log("--glass-tint:", JSON.stringify(rootCS.getPropertyValue("--glass-tint")));
      console.log("--glass-blur:", JSON.stringify(rootCS.getPropertyValue("--glass-blur")));

      const glasses = Array.from(document.querySelectorAll<HTMLElement>(".glass"));
      console.log(`found ${glasses.length} .glass element(s)`);

      glasses.slice(0, 3).forEach((el, idx) => {
        const cs = getComputedStyle(el);
        console.group(`.glass[${idx}] <${el.tagName.toLowerCase()}>`);
        console.log("computed backdrop-filter:", cs.backdropFilter || "(empty)");
        console.log("computed -webkit-backdrop-filter:", (cs as unknown as Record<string, string>).webkitBackdropFilter || "(empty)");
        console.log("computed background:", cs.background.slice(0, 80));
        console.log("rect:", el.getBoundingClientRect());

        // Walk ancestors looking for backdrop-root triggers
        let node: HTMLElement | null = el.parentElement;
        let depth = 0;
        const culprits: string[] = [];
        while (node && node !== document.documentElement && depth < 40) {
          const acs = getComputedStyle(node);
          const reasons = BACKDROP_ROOT_TRIGGERS(acs);
          if (reasons.length) {
            culprits.push(`<${node.tagName.toLowerCase()}${node.className ? "." + String(node.className).split(" ").join(".") : ""}> → ${reasons.join(", ")}`);
          }
          node = node.parentElement;
          depth++;
        }
        if (culprits.length) {
          console.warn("ancestors creating a backdrop-root (these kill the blur):");
          culprits.forEach((c) => console.warn("  •", c));
        } else {
          console.log("no backdrop-root ancestors found — backdrop-filter SHOULD render");
        }
        console.groupEnd();
      });
      console.groupEnd();
    }

    const id = setTimeout(run, 1200);
    (window as unknown as { __glassDebug: () => void }).__glassDebug = run;
    return () => clearTimeout(id);
  }, []);

  return null;
}
