(() => {
  if (window.__chatgptPdfPickerLoaded) return;
  window.__chatgptPdfPickerLoaded = true;

  let host;
  let root;
  let turns = [];
  let selected = new Set();
  let busy = false;
  let query = "";
  let assetMarkup = new Map();
  let assetFailures = [];
  const preferenceKeys = ["paper", "orientation", "margin", "fontSize", "showDate", "showLink", "toc", "pageBreak"];

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);

  const css = `
    :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif; color: #24242b; }
    * { box-sizing: border-box; }
    .panel { position: fixed; z-index: 2147483647; right: 16px; top: 16px; bottom: 16px; width: min(390px, calc(100vw - 32px)); background: #fff; border: 1px solid #dfdbe9; border-radius: 18px; box-shadow: 0 16px 60px #0004; display: flex; flex-direction: column; overflow: hidden; font-size: 14px; }
    header { padding: 18px 18px 14px; border-bottom: 1px solid #eceaf0; }
    .top { display: flex; align-items: center; gap: 8px; }
    h1 { font-size: 18px; margin: 0; flex: 1; }
    button { font: inherit; cursor: pointer; }
    .icon { border: 0; background: transparent; font-size: 22px; width: 28px; height: 28px; }
    .hint { color: #64636d; font-size: 12px; line-height: 1.5; margin: 7px 0 0; }
    .tools { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 16px; border-bottom: 1px solid #eceaf0; }
    .tools button { background: #f5f3f8; color: #38323d; border: 1px solid #e4dfea; border-radius: 8px; padding: 6px 9px; }
    .tools button:hover { background: #ebe4f8; }
    .search { padding: 10px 16px; border-bottom: 1px solid #eceaf0; }
    .search input { width: 100%; }
    .search-actions { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
    .search-actions span { flex: 1; color: #605b65; font-size: 12px; }
    .search-actions button { background: #f5f3f8; border: 1px solid #e4dfea; border-radius: 7px; padding: 5px 8px; font-size: 12px; }
    .list { min-height: 120px; overflow: auto; flex: 1; }
    .turn { display: flex; gap: 9px; align-items: flex-start; padding: 11px 16px; border-bottom: 1px solid #f0eef3; cursor: pointer; line-height: 1.4; }
    .turn:hover { background: #faf8fe; }
    .turn input { accent-color: #8552c8; width: 17px; height: 17px; margin: 1px 0 0; flex: none; }
    .role { font-size: 11px; color: #795ba2; font-weight: 700; display: block; margin-bottom: 3px; }
    .excerpt { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
    footer { max-height: 48vh; overflow: auto; flex-shrink: 0; padding: 14px 16px 16px; border-top: 1px solid #eceaf0; background: #fff; }
    details { margin-bottom: 12px; }
    summary { cursor: pointer; font-weight: 700; margin-bottom: 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .field { display: flex; flex-direction: column; gap: 4px; color: #55515d; font-size: 12px; }
    .field.wide { grid-column: 1 / -1; }
    input[type=text], select { width: 100%; border: 1px solid #d9d5df; border-radius: 8px; padding: 7px 8px; background: #fff; color: #24242b; font: inherit; font-size: 13px; }
    .checks { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; font-size: 12px; }
    .checks label { display: flex; align-items: center; gap: 4px; }
    .bottom { display: flex; align-items: center; gap: 12px; }
    #count { flex: 1; color: #605b65; }
    .primary { border: 0; border-radius: 9px; background: #8e55cd; color: white; font-weight: 700; padding: 10px 16px; }
    .primary:disabled { background: #c8c0d0; cursor: not-allowed; }
    #status { margin-top: 8px; font-size: 12px; color: #a23b42; min-height: 16px; }
    .secondary { border: 1px solid #cdb6e6; border-radius: 9px; background: white; color: #72449e; font-weight: 700; padding: 9px 11px; }
    .range { display: flex; align-items: end; gap: 7px; padding: 0 16px 10px; border-bottom: 1px solid #eceaf0; }
    .range label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #605b65; }
    .range input { width: 62px; border: 1px solid #d9d5df; border-radius: 7px; padding: 5px; }
    .range button { background: #f5f3f8; border: 1px solid #e4dfea; border-radius: 7px; padding: 6px 8px; font-size: 12px; }
    textarea { width: 100%; min-height: 56px; resize: vertical; border: 1px solid #d9d5df; border-radius: 8px; padding: 7px 8px; font: inherit; font-size: 12px; }
  `;

  function findTurns() {
    const modern = [...document.querySelectorAll('[data-chatgpt-search-unit-key]')]
      .filter(n => /:(user|assistant)$/.test(n.getAttribute('data-chatgpt-search-unit-key') || ''));
    let nodes = modern.length ? modern : [...document.querySelectorAll('[data-message-author-role="user"], [data-message-author-role="assistant"]')];
    if (!nodes.length) nodes = [...document.querySelectorAll('article[data-testid^="conversation-turn"]')];
    nodes = nodes.filter(node => !nodes.some(other => other !== node && other.contains(node)));
    const seenKeys = new Map();
    return nodes.map(node => {
      const unitKey = node.getAttribute('data-chatgpt-search-unit-key') || '';
      const role = node.getAttribute('data-message-author-role') || unitKey.match(/:(user|assistant)$/)?.[1] || node.querySelector('[data-conversation-role]')?.getAttribute('data-conversation-role') || node.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
      if (!['user', 'assistant'].includes(role)) return null;
      const body = modern.length ? node : node.querySelector('.markdown, .prose, .whitespace-pre-wrap') || node;
      const parts = [body];
      if (modern.length && role === 'assistant') {
        const block = node.parentElement;
        if (block?.parentElement && block.parentElement.closest('[data-talvt-turn-state]')) {
          let sibling = block.previousElementSibling;
          while (sibling && !sibling.querySelector('[data-chatgpt-search-unit-key]')) {
            if (sibling.querySelector('img, canvas, svg[role="img"]')) parts.unshift(sibling);
            sibling = sibling.previousElementSibling;
          }
        }
      }
      const text = (body.innerText || body.textContent || '').replace(/^(ChatGPT 說：|你說：)\s*/, '').trim() || (parts.some(p => p.querySelector('img, svg, canvas')) ? '[圖片／圖表訊息]' : '');
      const identity = node.getAttribute('data-chatgpt-search-message-ids') || node.getAttribute('data-message-id') || unitKey || `${role}:${text}`;
      const occurrence = seenKeys.get(identity) || 0;
      seenKeys.set(identity, occurrence + 1);
      return { key: `${identity}:${occurrence}`, role, body, parts, text, time: node.querySelector('time')?.getAttribute('datetime') || '' };
    }).filter(turn => turn?.text).map((turn, index) => ({ ...turn, number: index + 1 }));
  }

  function svgSnapshot(svg, terms) {
    const copy = svg.cloneNode(true);
    const originals = [svg, ...svg.querySelectorAll('*')];
    const copies = [copy, ...copy.querySelectorAll('*')];
    const properties = ['fill','fill-opacity','stroke','stroke-width','stroke-dasharray','stroke-opacity','opacity','color','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','display','visibility','white-space','line-height','background-color','border-radius','padding'];
    originals.forEach((original, index) => {
      const target = copies[index];
      if (target.localName === 'image') throw new Error('SVG 圖表內含尚未內嵌的圖片，請改用原頁面的完整圖像後再匯出。');
      if (target.localName === 'a') { target.replaceWith(...target.childNodes); return; }
      if (['script','style','iframe','object','embed'].includes(target.localName)) { target.remove(); return; }
      for (const attribute of [...target.attributes]) {
        const localReference = target.localName === 'use' && ['href','xlink:href'].includes(attribute.name) && /^#[A-Za-z0-9_.:-]+$/.test(attribute.value);
        if (/^on/i.test(attribute.name) || (!localReference && ['href','xlink:href','src'].includes(attribute.name))) target.removeAttribute(attribute.name);
      }
      const computed = getComputedStyle(original);
      target.removeAttribute('style');
      properties.forEach(property => {
        let value = computed.getPropertyValue(property);
        value = value.replace(/url\(["']?[^)]*#([^"')]+)["']?\)/g, 'url(#$1)');
        if (value && !/url\((?!#)/.test(value)) target.style.setProperty(property, value);
      });
      ['marker-start','marker-mid','marker-end'].forEach(property => {
        const value = computed.getPropertyValue(property).replace(/url\(["']?[^)]*#([^"')]+)["']?\)/g, 'url(#$1)');
        if (value && !/url\((?!#)/.test(value)) target.style.setProperty(property, value);
      });
    });
    const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) walker.currentNode.textContent = redact(walker.currentNode.textContent, terms);
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const icon = svg.getAttribute('data-d-component') === 'icon';
    copy.classList.add(icon ? 'export-content-icon' : 'export-diagram');
    copy.style.setProperty('display', 'block');
    copy.style.setProperty('visibility', 'visible');
    copy.style.setProperty('max-width', '100%');
    copy.style.setProperty('height', 'auto');
    if (icon) {
      const size = svg.getBoundingClientRect();
      copy.style.setProperty('width', `${size.width}px`);
      copy.style.setProperty('height', `${size.height}px`);
      copy.style.setProperty('flex-shrink','0');
    }
    return new XMLSerializer().serializeToString(copy);
  }

  async function embedImage(image) {
    const source = image.currentSrc || image.src;
    if (!source) throw new Error('有圖片尚未載入，請先讓圖片顯示後再匯出。');
    try {
      const external = new URL(source, location.href).origin !== location.origin;
      const response = await fetch(source, {credentials:external?'omit':'include',signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error('圖片讀取失敗：HTTP '+response.status);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('圖片格式不正確');
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (_) {
      try {
        await Promise.race([image.decode(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('圖片載入逾時')),5000))]);
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        if (!canvas.width || !canvas.height) throw new Error();
        canvas.getContext('2d').drawImage(image, 0, 0);
        return canvas.toDataURL('image/png');
      } catch (_) { throw new Error(image.naturalWidth ? '圖片可顯示，但來源可能限制跨來源讀取或畫布擷取' : '圖片尚未載入、網址無效或載入失敗'); }
    }
  }

  async function prepareAssets(chosen, terms, skipFailed = false) {
    assetMarkup = new Map();
    assetFailures = [];
    for (const turn of chosen) {
      let mediaIndex = 0;
      for (const part of turn.parts || [turn.body]) {
        const media = [...part.querySelectorAll('img, svg, canvas')];
        for (const node of media) {
          if (node.localName === 'svg') {
            const rect = node.getBoundingClientRect();
            if (((rect.width > 60 && rect.height > 40) || node.getAttribute('data-d-component') === 'icon') && !node.closest('button')) assetMarkup.set(node, svgSnapshot(node, terms));
          } else if (node.localName === 'img') {
            mediaIndex++;
            // UI-only / hidden images must not block exporting visible conversation content.
            if (node.closest('[hidden], .sr-only') || getComputedStyle(node).display === 'none') {assetMarkup.set(node,'');continue;}
            const label = `第 ${turns.indexOf(turn)+1} 則訊息，第 ${mediaIndex} 張圖片`;
            try {
              const src = await embedImage(node);
              assetMarkup.set(node, `<img src="${escapeHtml(src)}" alt="${escapeHtml(redact(node.alt || '圖片', terms))}">`);
            } catch (error) {
              const alt = redact(node.alt || '未命名圖片',terms);
              assetFailures.push(`${label}（${alt.slice(0,80)}）：${error.message}`);
              assetMarkup.set(node, `<aside class="missing-image" role="note">[圖片未能擷取：${escapeHtml(label)} · ${escapeHtml(alt)}。此處已略過圖片，請參考原對話。]</aside>`);
            }
          } else {
            try { assetMarkup.set(node, `<img src="${node.toDataURL('image/png')}" alt="圖表">`); }
            catch (_) { throw new Error('有 Canvas 圖表無法擷取，請先在原頁面確認圖表已載入。'); }
          }
        }
        for (const pre of part.querySelectorAll('pre')) {
          if (/mermaid/i.test(pre.className + ' ' + (pre.querySelector('code')?.className || '')) && !part.querySelector('svg[aria-roledescription], svg[id*="mermaid"]')) {
            throw new Error('有 Mermaid 仍只有程式碼；請先在 ChatGPT 展開圖表，工具才會匯出圖形。');
          }
        }
      }
    }
    if (assetFailures.length && !skipFailed) throw new Error('無法擷取 '+assetFailures.join('；')+'。可按「預覽並列印 PDF」重試，或勾選「略過失敗圖片」後匯出；略過處會保留明確標記。');
  }

  function renderList() {
    const list = root.getElementById("list");
    list.replaceChildren();
    const visible = filteredTurns();
    root.getElementById("matches").textContent = `符合 ${visible.length} 則`;
    for (const turn of visible) {
      const label = document.createElement("label");
      label.className = "turn";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = selected.has(turn.key);
      input.addEventListener("change", () => {
        input.checked ? selected.add(turn.key) : selected.delete(turn.key);
        updateCount();
      });
      const content = document.createElement("span");
      const role = document.createElement("span");
      role.className = "role";
      role.textContent = `${turn.number}. ${turn.role === "assistant" ? "ChatGPT" : "我"}`;
      const excerpt = document.createElement("span");
      excerpt.className = "excerpt";
      excerpt.textContent = turn.text.slice(0, 180);
      content.append(role, excerpt);
      label.append(input, content);
      list.append(label);
    }
    updateCount();
  }

  function filteredTurns() {
    if (!query) return turns;
    return turns.filter((turn) => turn.text.toLocaleLowerCase().includes(query));
  }

  function updateCount() {
    root.getElementById("count").textContent = `已選 ${selected.size} / ${turns.length} 則`;
    root.getElementById("export").disabled = selected.size === 0 || busy;
  }

  function setSelection(mode) {
    if (mode === "all") selected = new Set(turns.map((t) => t.key));
    if (mode === "none") selected.clear();
    if (mode === "invert") selected = new Set(turns.filter((t) => !selected.has(t.key)).map((t) => t.key));
    if (mode === "user" || mode === "assistant") selected = new Set(turns.filter((t) => t.role === mode).map((t) => t.key));
    if (mode === "matches") filteredTurns().forEach((t) => selected.add(t.key));
    if (mode === "clearMatches") filteredTurns().forEach((t) => selected.delete(t.key));
    renderList();
  }

  function selectRange() {
    const start = Number(root.getElementById("rangeStart").value);
    const end = Number(root.getElementById("rangeEnd").value);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > turns.length) {
      root.getElementById("status").textContent = `請輸入 1 到 ${turns.length} 之間的有效範圍。`;
      return;
    }
    turns.slice(start - 1, end).forEach((t) => selected.add(t.key));
    root.getElementById("status").textContent = `已加入第 ${start}–${end} 則。`;
    renderList();
  }

  function redactionTerms() {
    return [...new Set(root.getElementById("redactions").value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))].slice(0, 30);
  }

  function redact(text, terms) {
    let value = String(text ?? "");
    for (const term of terms) value = value.split(term).join("[已遮蔽]");
    return value;
  }

  function safeUrl(raw, kind) {
    try {
      const url = new URL(raw, location.href);
      if (["https:", "http:"].includes(url.protocol)) return url.href;
      if (kind === "image" && url.protocol === "data:" && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(raw)) return raw;
    } catch (_) {}
    return "";
  }

  const allowed = new Set("p br div span h1 h2 h3 h4 h5 h6 ul ol li pre code blockquote strong em b i u s del hr table thead tbody tfoot tr th td a img sup sub details summary figure figcaption".split(" "));
  function componentStyle(node) {
    if (node.localName === 'hr') return '';
    if (!node.hasAttribute('data-d-component')) return '';
    const computed = getComputedStyle(node);
    const properties = ['display','flex-direction','flex-wrap','align-items','align-self','justify-content','justify-items','gap','row-gap','column-gap','flex-grow','flex-shrink','flex-basis','grid-column','grid-row','grid-auto-flow','color','background-color','border-top','border-right','border-bottom','border-left','border-radius','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','white-space'];
    const style = document.createElement('span').style;
    for (const property of properties) {
      const value = computed.getPropertyValue(property);
      if (value && !/url\(|expression\(|[<>]/i.test(value)) style.setProperty(property, value);
    }
    if (computed.display === 'grid' || computed.display === 'inline-grid') {
      const declared = node.style.getPropertyValue('grid-template-columns');
      const value = declared && !/var\(|url\(|[<>;]/i.test(declared) ? declared : computed.gridTemplateColumns;
      style.setProperty('grid-template-columns', value);
      // Computed pixel tracks otherwise overflow narrower print pages.
      if (!declared && /^[\d.]+px(?: [\d.]+px)+$/.test(value)) {
        const tracks = value.split(' ');
        if (tracks.every(track => Math.abs(parseFloat(track)-parseFloat(tracks[0])) < 1)) style.setProperty('grid-template-columns', `repeat(${tracks.length},minmax(0,1fr))`);
      }
    }
    style.setProperty('min-width','0');
    style.setProperty('max-width','100%');
    style.setProperty('box-sizing','border-box');
    if (node.hasAttribute('data-d-has-border') && node.getBoundingClientRect().height < 700) style.setProperty('break-inside','avoid');
    style.setProperty('print-color-adjust','exact');
    style.setProperty('-webkit-print-color-adjust','exact');
    return ` class="export-rich-component" style="${escapeHtml(style.cssText)}"`;
  }

  function cleanNode(node, terms) {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(redact(node.textContent, terms));
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.localName;
    if (assetMarkup.has(node)) return assetMarkup.get(node);
    if (node.classList.contains('sr-only') || node.hidden || getComputedStyle(node).display === 'none') return '';
    if (tag === 'button') return [...node.querySelectorAll('img, canvas')].map(media => assetMarkup.get(media) || '').join('');
    if (tag === 'pre' && node.querySelector('code')) return `<pre><code>${escapeHtml(redact(node.querySelector('code').textContent, terms))}</code></pre>`;
    if (["script", "style", "iframe", "button", "input", "textarea", "select", "form", "svg", "canvas"].includes(tag)) return "";
    if (node.classList.contains("katex")) {
      const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      const display = !!node.closest('.katex-display');
      return `<span class="math" data-display="${display}" data-tex="${escapeHtml(redact(tex || node.getAttribute("aria-label") || node.innerText || "[公式]", terms))}">${escapeHtml(redact(tex || "[公式]", terms))}</span>`;
    }

    if (tag === "img") {
      const src = safeUrl(node.getAttribute("src"), "image");
      const alt = redact(node.getAttribute("alt") || "圖片", terms);
      return src && !terms.some((term) => src.includes(term)) ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">` : `<span>[${escapeHtml(alt)}]</span>`;
    }
    const children = [...node.childNodes].map((child) => cleanNode(child, terms)).join("");
    if (!allowed.has(tag)) return children;
    let attrs = componentStyle(node);
    if (['div','figure','section','span'].includes(tag) && node.querySelector('table')) attrs = ' class="export-table-wrap"';
    if (['table','thead','tbody','tfoot','tr','th','td'].includes(tag)) attrs = '';

    if (tag === "a") {
      const href = safeUrl(node.getAttribute("href"), "link");
      if (href && !terms.some((term) => href.includes(term))) attrs = ` href="${escapeHtml(href)}"`;
    }
    if (["th", "td"].includes(tag)) {
      for (const name of ["colspan", "rowspan"]) {
        const value = Number(node.getAttribute(name));
        if (Number.isInteger(value) && value > 1 && value <= 20) attrs += ` ${name}="${value}"`;
      }
    }
    if (tag === "br" || tag === "hr") return `<${tag}>`;
    return `<${tag}${attrs}>${children}</${tag}>`;
  }

  function cleanTurn(turn, terms) {
    const html = (turn.parts || [turn.body]).map(part => cleanNode(part, terms)).join("");
    if (!terms.length) return html;
    const probe = document.createElement("div");
    probe.innerHTML = html;
    for (const term of terms) {
      const walker = document.createTreeWalker(probe, NodeFilter.SHOW_TEXT);
      const nodes = []; let combined = '';
      while (walker.nextNode()) { nodes.push({node:walker.currentNode,start:combined.length}); combined += walker.currentNode.textContent; }
      const ranges = []; let at = 0;
      while ((at = combined.indexOf(term, at)) !== -1) { ranges.push([at, at + term.length]); at += term.length; }
      for (const {node,start} of nodes) {
        node.textContent = node.textContent.split('').map((c,i) => ranges.some(([a,b]) => start+i>=a && start+i<b) ? '█' : c).join('');
      }
    }
    return probe.innerHTML;
  }

  function settings() {
    const value = (id) => root.getElementById(id).value;
    const checked = (id) => root.getElementById(id).checked;
    return {
      title: value("title").trim() || document.title.replace(/\s*[-|] ChatGPT.*$/, "") || "ChatGPT 對話",
      author: value("author").trim(),
      paper: value("paper"), orientation: value("orientation"), margin: value("margin"),
      fontSize: Number(value("fontSize")), showDate: checked("showDate"),
      showLink: checked("showLink"), toc: checked("toc"), pageBreak: checked("pageBreak")
    };
  }

  async function restorePreferences() {
    try {
      const { layoutPrefs } = await chrome.storage.local.get("layoutPrefs");
      if (!host || !layoutPrefs) return;
      for (const id of preferenceKeys) {
        const field = root.getElementById(id);
        if (field.type === "checkbox" && typeof layoutPrefs[id] === "boolean") field.checked = layoutPrefs[id];
        else if (field.tagName === "SELECT" && [...field.options].some((option) => option.value === String(layoutPrefs[id]))) field.value = String(layoutPrefs[id]);
      }
    } catch (_) {}
  }

  async function savePreferences() {
    const layoutPrefs = {};
    for (const id of preferenceKeys) {
      const field = root.getElementById(id);
      layoutPrefs[id] = field.type === "checkbox" ? field.checked : field.value;
    }
    try { await chrome.storage.local.set({ layoutPrefs }); } catch (_) {}
  }

  async function exportPreview() {
    if (busy || selected.size === 0) return;
    busy = true;
    updateCount();
    root.getElementById("status").textContent = "正在整理所選訊息…";
    try {
      const terms = redactionTerms();
      const chosen = turns.filter(turn => selected.has(turn.key));
      await prepareAssets(chosen, terms, root.getElementById("skipFailedImages").checked);
      const chosenSettings = settings();
      chosenSettings.title = redact(chosenSettings.title, terms);
      chosenSettings.author = redact(chosenSettings.author, terms);
      const payload = {
        settings: chosenSettings,
        warnings: assetFailures.map(label=>`未能擷取：${label}`),
        source: terms.some((term) => location.href.includes(term)) ? "" : location.href,
        exportedAt: new Date().toISOString(),
        turns: chosen.map((turn) => ({
          role: turn.role, text: redact(turn.text, terms), html: cleanTurn(turn, terms), time: turn.time
        }))
      };
      const response = await chrome.runtime.sendMessage({ type: "CREATE_PREVIEW", payload });
      if (!response?.ok) throw new Error(response?.error || "無法建立預覽頁");
      root.getElementById("status").textContent = assetFailures.length ? `已開啟預覽；略過 ${assetFailures.length} 張失敗圖片，文件內已標記。` : "已開啟列印預覽分頁。";
    } catch (error) {
      root.getElementById("status").textContent = `匯出失敗：${error.message}`;
    } finally {
      busy = false;
      updateCount();
    }
  }

  function mount() {
    if (host) { host.remove(); host = null; return; }
    query = "";
    turns = findTurns();
    selected = new Set(turns.map((t) => t.key));
    host = document.createElement("div");
    host.id = "chatgpt-pdf-picker-host";
    root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    root.innerHTML = `<div class="panel" role="dialog" aria-label="ChatGPT 對話選取列印">
      <header><div class="top"><h1>對話選取列印 · v1.6.3</h1><button class="icon" id="refresh" title="重新擷取訊息">↻</button><button class="icon" id="close" title="關閉">×</button></div>
      <p class="hint">選取訊息後匯出；已顯示的圖片和流程圖會一起保留。長對話請捲動載入後按 ↻。</p></header>
      <div class="tools"><button data-select="all">全選</button><button data-select="user">只選提問</button><button data-select="assistant">只選回答</button><button data-select="none">清空</button><button data-select="invert">反選</button></div>
      <div class="search"><input type="text" id="search" placeholder="搜尋訊息內容" aria-label="搜尋訊息內容"><div class="search-actions"><span id="matches"></span><button data-select="matches">加入結果</button><button data-select="clearMatches">取消結果</button></div></div>
      <div class="range"><label>從第<input type="number" id="rangeStart" min="1" value="1"></label><label>到第<input type="number" id="rangeEnd" min="1" value="1"></label><button id="rangeSelect">加入範圍</button></div>
      <div class="list" id="list"></div>
      <footer><label style="display:block;margin:6px 0;font-size:12px"><input type="checkbox" id="skipFailedImages">略過失敗圖片（文件中保留缺圖標記）</label><details><summary>PDF 設定</summary><div class="grid">
        <label class="field wide">文件標題<input type="text" id="title"></label>
        <label class="field wide">作者名稱（選填）<input type="text" id="author" placeholder="留空不顯示"></label>
        <label class="field">紙張<select id="paper"><option>A4</option><option>Letter</option></select></label>
        <label class="field">方向<select id="orientation"><option value="portrait">直式</option><option value="landscape">橫式</option></select></label>
        <label class="field">頁面邊界<select id="margin"><option value="normal">一般</option><option value="compact">窄</option><option value="wide">寬</option></select></label>
        <label class="field">字體大小<select id="fontSize"><option value="12" selected>12 pt</option><option value="14">14 pt</option><option value="16">16 pt</option><option value="18">18 pt</option></select></label>
      </div><div class="checks"><label><input type="checkbox" id="showDate" checked>匯出日期</label><label><input type="checkbox" id="showLink" checked>對話連結</label><label><input type="checkbox" id="toc">訊息目錄</label><label><input type="checkbox" id="pageBreak">每則換頁</label></div>
      <label class="field" style="margin-top:10px">遮蔽文字（每行一個，完全相同的字串）<textarea id="redactions" placeholder="例如：姓名、學號或電子郵件"></textarea></label><p class="hint">遮蔽只套用匯出內容；此清單不會儲存。</p></details>
      <div class="bottom"><span id="count"></span><button class="primary" id="export">預覽並列印 PDF</button></div><div id="status" role="status"></div></footer>
    </div>`;
    root.prepend(style);
    document.documentElement.append(host);
    root.getElementById("title").value = document.title.replace(/\s*[-|] ChatGPT.*$/, "") || "ChatGPT 對話";
    root.getElementById("rangeEnd").value = String(turns.length || 1);
    root.getElementById("rangeEnd").max = String(turns.length);
    root.getElementById("rangeStart").max = String(turns.length);
    root.getElementById("close").addEventListener("click", () => { host.remove(); host = null; });
    root.getElementById("refresh").addEventListener("click", () => {
      const previous = selected;
      const hadTurns = turns.length > 0;
      turns = findTurns();
      selected = new Set(turns.filter((t) => !hadTurns || previous.has(t.key)).map((t) => t.key));
      root.getElementById("rangeEnd").value = String(turns.length || 1);
      root.getElementById("rangeEnd").max = String(turns.length);
      root.getElementById("rangeStart").max = String(turns.length);
      renderList();
      root.getElementById("status").textContent = "已重新擷取；原有勾選已保留，新訊息請自行選取。";
    });
    root.getElementById("search").addEventListener("input", (event) => { query = event.target.value.trim().toLocaleLowerCase(); renderList(); });
    root.getElementById("rangeSelect").addEventListener("click", selectRange);
    root.querySelectorAll("[data-select]").forEach((button) => button.addEventListener("click", () => setSelection(button.dataset.select)));
    preferenceKeys.forEach((id) => root.getElementById(id).addEventListener("change", savePreferences));
    root.getElementById("export").addEventListener("click", exportPreview);
    renderList();
    restorePreferences();
    if (!turns.length) root.getElementById("status").textContent = "找不到訊息；請先開啟一則 ChatGPT 對話。";
  }

  const launcherDefaults = {position:'top',background:'#7041aa',foreground:'#ffffff',alpha:100};
  let launcherPrefs = {...launcherDefaults};
  function installLauncher() {
    if (document.getElementById('chatgpt-pdf-launcher')) return;
    const launcher = document.createElement('div');
    launcher.id = 'chatgpt-pdf-launcher';
    const shadow = launcher.attachShadow({mode:'open'});
    shadow.innerHTML = `<style>
      :host{all:initial}.dock{position:fixed;z-index:2147483646;display:flex;gap:1px;border:1px solid #8885;border-radius:8px;background:var(--bg);color:var(--fg)}
      button{border:0;background:transparent;color:inherit;font:600 12px -apple-system,BlinkMacSystemFont,sans-serif;padding:8px;cursor:pointer;border-radius:7px}button:hover{box-shadow:inset 0 0 0 1px currentColor}button:focus-visible{outline:2px solid currentColor}
      .settings{position:fixed;z-index:2147483647;right:18px;top:60px;width:245px;padding:16px;border:1px solid #ddd;border-radius:12px;background:#fff;color:#222;box-shadow:0 6px 24px #0003;font:14px -apple-system,BlinkMacSystemFont,sans-serif}.settings[hidden]{display:none}label{display:flex;align-items:center;justify-content:space-between;margin:12px 0}select{max-width:140px}input[type=range]{width:115px}.footer{display:flex;justify-content:space-between}small{display:block;line-height:1.5;color:#666}
      @media(max-width:600px){button{padding:7px;font-size:11px}}
    </style><div class="dock"><button id="choose" title="選取訊息、列印 PDF 或匯出 Markdown / JSON">列印／匯出</button><button id="all" title="直接預覽全部已載入訊息">全部</button><button id="appearance" aria-label="按鈕外觀設定" title="位置、顏色、透明度">⚙</button></div>
    <section class="settings" hidden aria-label="按鈕外觀設定"><strong>按鈕外觀</strong><label>位置<select id="position"><option value="top">右上角（分享旁）</option><option value="bottom">右下角（輸入列旁）</option></select></label><label>背景色<input id="background" type="color"></label><label>文字色<input id="foreground" type="color"></label><label>背景透明度<input id="alpha" type="range" min="0" max="100"><output id="alphaValue"></output></label><small>0% 完全透明，100% 不透明。文字與按鈕仍可點擊。設定自動儲存在此瀏覽器。</small><div class="footer"><button id="reset">恢復預設</button><button id="done">完成</button></div></section>`;
    const dock=shadow.querySelector('.dock'), popup=shadow.querySelector('.settings');
    function reposition() {
      if (launcherPrefs.position==='bottom') {dock.style.top='auto';dock.style.bottom='22px';dock.style.right='18px';return;}
      const candidates=[...document.querySelectorAll('button')].filter(el => /分享|share/i.test(el.getAttribute('aria-label')||el.textContent||''));
      const anchor=candidates.find(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.top<100&&r.width>0&&r.left>innerWidth/2;});
      const r=anchor?.getBoundingClientRect();
      dock.style.bottom='auto';dock.style.top=(r?Math.max(8,r.top):12)+'px';
      dock.style.right=(r?Math.max(18,innerWidth-r.left+10):210)+'px';
      if (dock.getBoundingClientRect().left<8) dock.style.right='18px';
    }
    function apply() {
      const hex=launcherPrefs.background;
      dock.style.setProperty('--bg',`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${launcherPrefs.alpha/100})`);
      dock.style.setProperty('--fg',launcherPrefs.foreground);
      for(const id of ['position','background','foreground','alpha'])shadow.getElementById(id).value=launcherPrefs[id];
      shadow.getElementById('alphaValue').textContent=launcherPrefs.alpha+'%';reposition();
    }
    async function save(){apply();try{await chrome.storage.local.set({launcherPrefs});}catch(_){}}
    shadow.getElementById('choose').addEventListener('click',mount);
    shadow.getElementById('all').addEventListener('click',async()=>{if(busy)return;if(!host)mount();await restorePreferences();root.getElementById("fontSize").value="12";turns=findTurns();selected=new Set(turns.map(turn=>turn.key));renderList();await exportPreview();});
    shadow.getElementById('appearance').addEventListener('click',()=>{popup.hidden=!popup.hidden;});
    shadow.getElementById('done').addEventListener('click',()=>{popup.hidden=true;});
    for(const id of ['position','background','foreground','alpha'])shadow.getElementById(id).addEventListener('input',e=>{launcherPrefs[id]=id==='alpha'?Number(e.target.value):e.target.value;save();});
    shadow.getElementById('reset').addEventListener('click',()=>{launcherPrefs={...launcherDefaults};save();});
    document.documentElement.append(launcher);apply();
    chrome.storage.local.get('launcherPrefs').then(data=>{
      const prefs=data.launcherPrefs||{};
      launcherPrefs={position:prefs.position==='bottom'?'bottom':'top',background:/^#[0-9a-f]{6}$/i.test(prefs.background)?prefs.background:launcherDefaults.background,foreground:/^#[0-9a-f]{6}$/i.test(prefs.foreground)?prefs.foreground:launcherDefaults.foreground,alpha:Number.isFinite(prefs.alpha)?Math.max(0,Math.min(100,prefs.alpha)):100};apply();
    }).catch(()=>{});
    window.addEventListener('resize',reposition);
    // Header contents can change during navigation between chats.
    const observer=new MutationObserver(reposition);observer.observe(document.body,{childList:true,subtree:true});
  }
  installLauncher();
  new MutationObserver(()=>{if(!document.getElementById('chatgpt-pdf-launcher'))installLauncher();}).observe(document.documentElement,{childList:true});

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "TOGGLE_PANEL") mount();
  });
})();
