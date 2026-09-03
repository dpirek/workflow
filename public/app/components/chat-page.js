const icon = (name) => {
  if (name === 'plus') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  if (name === 'mic') return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/></svg>';
  if (name === 'stop') return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v14"/></svg>';
};

export function chatPage({ sessions = [], activeSession = null, running = false, draftImages = [] } = {}) {
  const messages = activeSession?.messages || [];
  const recentRun = activeSession?.latestRun;
  const conversation = messages.length ? messages.map(messageHtml).join('') : welcomeMessage();
  const failure = recentRun?.status === 'failed' && recentRun.error ? failureMessage(recentRun.error) : '';
  return `<section class="chat-page">
    <aside class="chat-history" aria-label="Conversation history">
      <button class="chat-new" type="button" data-chat-new><span>＋</span> New chat</button>
      <div class="chat-history-list">${sessions.map((session) => `<div class="chat-history-row${session.id === activeSession?.id ? ' active' : ''}"><button type="button" data-chat-session="${escapeHtml(session.id)}"><b>${escapeHtml(session.title)}</b><small>${formatRelative(session.updatedAt)}</small></button><button class="chat-delete" type="button" data-chat-delete="${escapeHtml(session.id)}" aria-label="Delete ${escapeHtml(session.title)}">×</button></div>`).join('') || '<p>No conversations yet.</p>'}</div>
    </aside>
    <div class="chat-main">
      <div class="chat-scroll" data-chat-scroll><div class="chat-thread">${conversation}${failure}<div class="chat-live" data-chat-live></div></div></div>
      <div class="chat-footer">
        ${stepSummary(recentRun, running)}
        <div class="chat-image-previews">${draftImages.map((image, index) => `<span>${escapeHtml(image.name)}<button type="button" data-remove-image="${index}" aria-label="Remove image">×</button></span>`).join('')}</div>
        <form class="chat-composer" data-chat-form>
          <input data-chat-images type="file" accept="image/*" multiple hidden>
          <button class="chat-tool" type="button" data-chat-attach aria-label="Add image" title="Add image">${icon('plus')}</button>
          <textarea name="message" rows="1" placeholder="Ask Flow" aria-label="Message Flow" ${running ? 'disabled' : ''} required></textarea>
          <button class="chat-tool chat-mic" type="button" data-chat-mic aria-label="Use microphone" title="Use microphone" ${running ? 'disabled' : ''}>${icon('mic')}</button>
          <button class="chat-send${running ? ' is-stop' : ''}" type="${running ? 'button' : 'submit'}" ${running ? 'data-chat-stop aria-label="Stop response"' : 'aria-label="Send message" disabled'}>${icon(running ? 'stop' : 'send')}</button>
        </form>
      </div>
    </div>
  </section>`;
}

function stepSummary(run, running) {
  const steps = run?.stepSummary || [];
  if (!steps.length && !running) return '';
  const status = running ? 'running' : run?.status || 'completed';
  return `<details class="chat-steps" ${running || status === 'failed' ? 'open' : ''}><summary><span class="step-pulse ${status}"></span>${running ? 'Flow is working…' : `${steps.length} step${steps.length === 1 ? '' : 's'} · ${status}`}</summary><ol>${steps.map((step) => `<li class="${escapeHtml(step.status)}"><span></span><div>${escapeHtml(step.label)}${step.error ? `<small>${escapeHtml(step.error)}</small>` : ''}</div></li>`).join('')}</ol></details>`;
}

function failureMessage(error) {
  return `<article class="chat-message assistant chat-failure"><div class="chat-avatar">!</div><div class="chat-bubble"><strong>Flow couldn’t complete this request.</strong><p>${escapeHtml(error)}</p></div></article>`;
}

export function renderChatMessage(message) {
  return messageHtml(message);
}

function welcomeMessage() {
  return `<article class="chat-message assistant"><div class="chat-avatar">✦</div><div class="chat-response"><p>Flow is ready to help you inspect, build, and operate your workflows.</p><ul><li>Review requests, tasks, jobs, and incidents.</li><li>Explain definitions and execution history.</li><li>Start processes or perform workflow operations.</li></ul><div class="chat-code"><span>TRY IT</span><code>Show me the requests that still need human review</code></div></div></article>`;
}

function messageHtml(message) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const images = (message.images || []).map((image) => `<small class="chat-attachment">▧ ${escapeHtml(image.name)}</small>`).join('');
  return `<article class="chat-message ${role}">${role === 'assistant' ? '<div class="chat-avatar">✦</div>' : ''}<div class="chat-bubble">${renderMarkdown(message.content)}${images}</div></article>`;
}

export function renderMarkdown(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([^`]*)$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      const language = fence[1].trim().replace(/[^A-Za-z0-9_-]/g, '');
      const source = code.join('\n');
      output.push(language.toLowerCase() === 'svg' ? renderSvg(source) : `<pre><code${language ? ` class="language-${language}"` : ''}>${escapeHtml(source)}</code></pre>`);
      continue;
    }

    if (/^\s*<svg\b/i.test(line)) {
      const svg = [line];
      index += 1;
      while (index < lines.length && !/<\/svg>\s*$/i.test(svg.at(-1))) svg.push(lines[index++]);
      const source = svg.join('\n');
      if (/<\/svg>\s*$/i.test(source)) {
        output.push(renderSvg(source));
      } else {
        output.push(`<p>${inlineMarkdown(source)}</p>`);
      }
      continue;
    }

    if (isTableHeader(lines, index)) {
      const headings = splitTableRow(line);
      const alignments = splitTableRow(lines[index + 1]).map(tableAlignment);
      const rows = [];
      index += 2;
      while (index < lines.length && isTableRow(lines[index])) rows.push(splitTableRow(lines[index++]));
      const cell = (tag, content, cellIndex) => {
        const alignment = alignments[cellIndex];
        return `<${tag}${alignment ? ` class="align-${alignment}"` : ''}>${inlineMarkdown(content || '')}</${tag}>`;
      };
      output.push(`<div class="chat-table-wrap"><table><thead><tr>${headings.map((heading, cellIndex) => cell('th', heading, cellIndex)).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headings.map((_, cellIndex) => cell('td', row[cellIndex], cellIndex)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    const list = line.match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
    if (list) {
      const ordered = Boolean(list[2]);
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
        if (!item || Boolean(item[2]) !== ordered) break;
        items.push(`<li>${inlineMarkdown(item[3])}</li>`);
        index += 1;
      }
      output.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index++].replace(/^\s*>\s?/, ''));
      }
      output.push(`<blockquote>${quote.map(inlineMarkdown).join('<br>')}</blockquote>`);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !startsMarkdownBlock(lines, index)) {
      paragraph.push(lines[index++]);
    }
    output.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
  }
  return output.join('');
}

function startsMarkdownBlock(lines, index) {
  const line = lines[index];
  return /^\s*```/.test(line) || /^(#{1,3})\s+/.test(line) ||
    /^\s*(?:[-+*]|\d+\.)\s+/.test(line) || /^\s*>\s?/.test(line) ||
    /^\s*<svg\b/i.test(line) || isTableHeader(lines, index);
}

function isTableHeader(lines, index) {
  return isTableRow(lines[index]) && index + 1 < lines.length &&
    splitTableRow(lines[index + 1]).length === splitTableRow(lines[index]).length &&
    splitTableRow(lines[index + 1]).every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function isTableRow(line = '') {
  const trimmed = line.trim();
  return trimmed.includes('|') && !/^\s*```/.test(trimmed);
}

function splitTableRow(line = '') {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cell = '';
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] === '\\' && trimmed[index + 1] === '|') {
      cell += '|';
      index += 1;
    } else if (trimmed[index] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += trimmed[index];
    }
  }
  cells.push(cell.trim());
  return cells;
}

function tableAlignment(marker) {
  const value = marker.trim();
  if (value.startsWith(':') && value.endsWith(':')) return 'center';
  if (value.endsWith(':')) return 'right';
  if (value.startsWith(':')) return 'left';
  return '';
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderSvg(source) {
  const svg = String(source || '').trim();
  if (!/^<svg\b[\s\S]*<\/svg>$/i.test(svg)) {
    return `<pre><code class="language-svg">${escapeHtml(svg)}</code></pre>`;
  }
  if (svg.length > 250_000) {
    return '<div class="chat-svg-error">SVG preview is too large to render.</div>';
  }
  const title = svg.match(/<title(?:\s[^>]*)?>([^<]{1,160})<\/title>/i)?.[1]?.trim() || 'Generated SVG';
  const sourceUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return `<figure class="chat-svg-preview"><img src="${sourceUrl}" alt="${escapeHtml(title)}"><figcaption>${escapeHtml(title)}</figcaption></figure>`;
}

function formatRelative(value) {
  const raw = String(value || '');
  const date = new Date(raw.replace(' ', 'T') + (raw.endsWith('Z') ? '' : 'Z'));
  if (Number.isNaN(date.getTime())) return '';
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 60_000) return 'Now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function assistantReply(prompt) {
  return `Flow is ready to answer “${String(prompt || '').trim()}” through the configured model.`;
}
