function parseMarkdown(src) {
  const lines = src.split("\n");
  let html = "";
  let inList = false;
  let inBlockquote = false;
  let paragraph = [];

  function inline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function flush() {
    if (paragraph.length) {
      html += "<p>" + inline(paragraph.join(" ")) + "</p>\n";
      paragraph = [];
    }
  }

  function closeList() {
    if (inList) {
      html += "</ul>\n";
      inList = false;
    }
  }

  function closeBq() {
    if (inBlockquote) {
      html += "</blockquote>\n";
      inBlockquote = false;
    }
  }

  for (const line of lines) {
    const t = line.trim();

    if (t === "") {
      flush();
      closeList();
      closeBq();
      continue;
    }

    if (/^---+$/.test(t)) {
      flush();
      closeList();
      closeBq();
      html += "<hr>\n";
      continue;
    }

    const hm = t.match(/^(#{1,3})\s+(.+)$/);
    if (hm) {
      flush();
      closeList();
      closeBq();
      const lvl = hm[1].length;
      html += `<h${lvl}>${inline(hm[2])}</h${lvl}>\n`;
      continue;
    }

    const lm = t.match(/^[-*]\s+(.+)$/);
    if (lm) {
      flush();
      closeBq();
      if (!inList) {
        html += "<ul>\n";
        inList = true;
      }
      html += `<li>${inline(lm[1])}</li>\n`;
      continue;
    }

    const bq = t.match(/^>\s*(.*)$/);
    if (bq) {
      flush();
      closeList();
      if (!inBlockquote) {
        html += "<blockquote>\n";
        inBlockquote = true;
      }
      if (bq[1]) html += `<p>${inline(bq[1])}</p>\n`;
      continue;
    }

    paragraph.push(t);
  }

  flush();
  closeList();
  closeBq();
  return html;
}

async function loadContent() {
  const el = document.getElementById("prose");
  if (!el) return;

  const src = el.getAttribute("data-src");
  if (!src) return;

  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`${res.status}`);
    const md = await res.text();
    el.innerHTML = parseMarkdown(md);
  } catch {
    el.innerHTML = '<p class="load-error">Failed to load content.</p>';
  }
}

loadContent();
