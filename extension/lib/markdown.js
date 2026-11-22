// Small, safe Markdown → HTML for Focus AI replies in the side panel.
// Safety model: the WHOLE source is HTML-escaped first; tags are then built
// only from that escaped text, so model output can never inject markup.
// Links are emitted only for http(s) URLs. Supports what the assistant uses:
// headings, paragraphs, bold/italic, inline + fenced code, lists, quotes,
// tables, rules and links.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function inline(escaped) {
  // Code spans first, protected from further formatting.
  const codes = [];
  let s = escaped.replace(/`([^`\n]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

const isTableSep = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));

export function renderMarkdown(src) {
  const lines = escapeHtml(String(src ?? "").replace(/\r\n?/g, "\n")).split("\n");
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join("<br>"))}</p>`);
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      flush();
      const code = [];
      while (++i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${code.join("\n")}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flush(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); const n = Math.min(6, h[1].length + 2); out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push("<hr>"); continue; }

    if (/^\s*&gt;\s?/.test(line)) {
      flush();
      const quote = [];
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*&gt;\s?/, ""));
      i--;
      out.push(`<blockquote>${inline(quote.join("<br>"))}</blockquote>`);
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush();
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      i--;
      out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${
        rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }

    const li = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      flush();
      const ordered = /\d/.test(li[1]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (!m || /\d/.test(m[1]) !== ordered) break;
        const task = m[2].match(/^\[([ xX])\]\s+(.*)$/);
        items.push(task
          ? `<li class="check">${task[1].trim() ? "☑" : "☐"} ${inline(task[2])}</li>`
          : `<li>${inline(m[2])}</li>`);
        i++;
      }
      i--;
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }

    para.push(line);
  }
  flush();
  return out.join("");
}
