function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="markdown-inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export function renderMarkdownSafe(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inList = false;
  let inCode = false;
  let codeBuffer: string[] = [];

  const flushList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith('```')) {
      flushList();
      if (!inCode) {
        inCode = true;
        codeBuffer = [];
      } else {
        inCode = false;
        out.push(`<pre class="markdown-code-block"><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushList();
      continue;
    }

    if (line.startsWith('### ')) {
      flushList();
      out.push(`<h3 class="markdown-h3">${renderInline(line.slice(4))}</h3>`);
      continue;
    }

    if (line.startsWith('## ')) {
      flushList();
      out.push(`<h2 class="markdown-h2">${renderInline(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith('# ')) {
      flushList();
      out.push(`<h1 class="markdown-h1">${renderInline(line.slice(2))}</h1>`);
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        out.push('<ul class="markdown-list">');
        inList = true;
      }
      out.push(`<li>${renderInline(line.slice(2))}</li>`);
      continue;
    }

    flushList();
    out.push(`<p class="markdown-paragraph">${renderInline(line)}</p>`);
  }

  flushList();
  if (inCode) {
    out.push(`<pre class="markdown-code-block"><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }

  return out.join('');
}
