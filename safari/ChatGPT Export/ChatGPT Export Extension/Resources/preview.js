const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[c]);

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium", timeStyle: "short"
  }).format(date);
}

function safeLink(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch (_) { return ""; }
}

function markdownInline(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  if (node.matches('.math[data-tex]')) {
    const tex=node.getAttribute('data-tex');
    return node.getAttribute('data-display')==='true' ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
  }
  const tag = node.localName;
  const children = [...node.childNodes].map(markdownInline).join("");
  if (["strong", "b"].includes(tag)) return `**${children}**`;
  if (["em", "i"].includes(tag)) return `*${children}*`;
  if (tag === "code") return `\`${children.replace(/`/g, "\\`")}\``;
  if (tag === "br") return "\n";
  if (tag === "a") {
    const href = safeLink(node.getAttribute("href"));
    return href ? `[${children}](${href.replace(/\)/g, "%29")})` : children;
  }
  if (tag === "svg") return node.outerHTML;
  if (tag === "img") return node.src.startsWith("data:image/") ? node.outerHTML : `[圖片：${node.getAttribute("alt") || "圖片"}]`;
  return children;
}

function markdownBlock(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = node.localName;
  if (node.classList.contains("export-rich-component")) return `${node.outerHTML}\n\n`;
  if (tag === "svg") return `${node.outerHTML}\n\n`;
  if (tag === "pre") {
    const code = node.textContent.trimEnd();
    const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((match) => match[0].length));
    const fence = "`".repeat(longest + 1);
    return `${fence}\n${code}\n${fence}\n\n`;
  }
  if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${markdownInline(node)}\n\n`;
  if (tag === "ul" || tag === "ol") return [...node.children].map((li, index) => `${tag === "ol" ? `${index + 1}.` : "-"} ${markdownInline(li).trim()}`).join("\n") + "\n\n";
  if (tag === "blockquote") return markdownInline(node).trim().split("\n").map((line) => `> ${line}`).join("\n") + "\n\n";
  if (tag === "table") return `${node.outerHTML}\n\n`;
  if (["p", "div", "details", "summary"].includes(tag)) {
    const hasBlocks = [...node.children].some((child) => ["p", "div", "pre", "ul", "ol", "table", "blockquote", "svg", "img", "figure", "h1", "h2", "h3", "h4"].includes(child.localName));
    return hasBlocks ? [...node.childNodes].map(markdownBlock).join("") : `${markdownInline(node).trim()}\n\n`;
  }
  return markdownInline(node);
}

function downloadMarkdown(payload) {
  const { settings, turns, source, exportedAt, warnings } = payload;
  const lines = [`# ${settings.title || "ChatGPT 對話"}`, ""];
  if (settings.author) lines.push(`作者：${settings.author}`, "");
  if (settings.showDate) lines.push(`匯出時間：${formatDate(exportedAt)}`, "");
  if (settings.showLink && safeLink(source)) lines.push(`對話連結：${source}`, "");
  if (Array.isArray(warnings) && warnings.length) lines.push('> 圖片擷取提醒：'+warnings.join('；'), '');
  turns.forEach((turn, index) => {
    const container = document.createElement("div");
    container.innerHTML = turn.html || "";
    const body = [...container.childNodes].map(markdownBlock).join("").trim();
    lines.push(`## ${index + 1}. ${turn.role === "assistant" ? "ChatGPT" : "我"}`, "", body, "");
  });
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(settings.title || "ChatGPT-對話").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 80)}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function downloadJson(payload) {
  const data = {
    schema: "chatgpt-conversation-export/v1",
    title: payload.settings.title || "ChatGPT 對話",
    source: safeLink(payload.source),
    exportedAt: payload.exportedAt,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    messages: payload.turns.map((turn) => ({
      role: turn.role === "assistant" ? "assistant" : "user",
      text: (() => {const container=document.createElement('div');container.innerHTML=turn.html||'';return window.ConversationFormats ? ConversationFormats.plainText(container).trim() : turn.text;})(),
      ...(turn.time ? { createdAt: turn.time } : {})
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${data.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 80)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function render(payload) {
  const { settings, turns, source, exportedAt, warnings } = payload || {};
  if (!settings || !Array.isArray(turns) || !turns.length) throw new Error("預覽資料不完整");
  const paper = settings.paper === "Letter" ? "Letter" : "A4";
  const orientation = settings.orientation === "landscape" ? "landscape" : "portrait";
  const margin = { compact: "10mm", normal: "17mm", wide: "24mm" }[settings.margin] || "17mm";
  const fontSize = [12, 14, 16, 18].includes(settings.fontSize) ? settings.fontSize : 14;
  const printStyle = document.createElement("style");
  printStyle.setAttribute("data-export-style", "");
  printStyle.textContent = `@page { size: ${paper} ${orientation}; margin: ${margin}; }`;
  document.head.append(printStyle);
  document.documentElement.style.setProperty("--body-size", `${fontSize}pt`);
  document.title = `${settings.title || "ChatGPT 對話"} - 列印`;
  const sourceUrl = safeLink(source);
  const metadata = [
    settings.author ? `<span>作者：${escapeHtml(settings.author)}</span>` : "",
    settings.showDate ? `<span>匯出時間：${escapeHtml(formatDate(exportedAt))}</span>` : "",
    settings.showLink && sourceUrl ? `<span>對話連結：<a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceUrl)}</a></span>` : ""
  ].join("");
  const toc = settings.toc ? `<nav class="toc"><h2>訊息目錄</h2><ol>${turns.map((turn, i) =>
    `<li><a href="#message-${i + 1}">${turn.role === "assistant" ? "ChatGPT" : "我"}：${escapeHtml((turn.text || "").replace(/\s+/g, " ").slice(0, 56))}</a></li>`
  ).join("")}</ol></nav>` : "";
  const messages = turns.map((turn, i) => `<section class="message" id="message-${i + 1}">
    <div class="message-head"><span class="message-number">${String(i + 1).padStart(2, "0")}</span><span class="message-role">${turn.role === "assistant" ? "ChatGPT" : "我"}</span>${turn.time ? `<span class="message-time">${escapeHtml(formatDate(turn.time))}</span>` : ""}</div>
    <div class="message-body">${turn.html || ""}</div>
  </section>`).join("");
  const documentRoot = document.getElementById("document");
  documentRoot.classList.toggle("page-break", !!settings.pageBreak);
  documentRoot.innerHTML = `<div class="cover"><h1>${escapeHtml(settings.title || "ChatGPT 對話")}</h1><div class="meta">${metadata}</div></div>${toc}${messages}`;
  let mathFailed = false;
  for (const element of documentRoot.querySelectorAll('.math[data-tex]')) {
    try {
      katex.render(element.getAttribute('data-tex'), element, {displayMode:element.getAttribute('data-display')==='true',throwOnError:true,trust:false,strict:'ignore',maxExpand:1000});
    } catch (error) {
      mathFailed = true;
      element.textContent = '公式渲染失敗：' + element.getAttribute('data-tex');
    }
  }
  if (Array.isArray(warnings) && warnings.length) {
    const summary=document.createElement('aside');summary.className='export-warnings';
    summary.textContent='本次匯出有 '+warnings.length+' 張圖片未能擷取，已保留缺圖標記。'+warnings.join('；');
    documentRoot.querySelector('.cover').after(summary);
  }
  const printButton = document.getElementById('print');
  printButton.disabled = true;
  Promise.all([...documentRoot.querySelectorAll('img')].map(img => img.decode())).then(async () => {
    await document.fonts.ready;
    printButton.disabled = mathFailed;
    if (mathFailed) {const warning=document.createElement('p');warning.textContent='有公式無法渲染，已暫停列印，請檢查公式或回報此問題。';documentRoot.prepend(warning);}

  }).catch(() => {
    const warning = document.createElement('p');
    warning.textContent = '圖片未完整載入，已暫停列印。請回原對話重新擷取，避免產生缺圖 PDF。';
    warning.style.color = '#a03746';
    documentRoot.prepend(warning);
  });
}

document.getElementById("print").addEventListener("click", () => window.print());

(async () => {
  try {
    const id = new URL(location.href).searchParams.get("id");
    if (!id || !/^[\w-]+$/.test(id)) throw new Error("找不到預覽識別碼");
    const key = `preview_${id}`;
    const stored = await chrome.storage.session.get(key);
    render(stored[key]);
    document.getElementById("markdown").addEventListener("click", () => downloadMarkdown(stored[key]));
    document.getElementById("json").addEventListener("click", () => downloadJson(stored[key]));
    const extraExport=document.getElementById('export-file');
    if(extraExport) extraExport.addEventListener('click',async()=>{
      extraExport.disabled=true;
      try { await ConversationFormats.exportFile(document.getElementById('file-format').value,document.getElementById('document'),stored[key].settings.title||'ChatGPT conversation',{fontSize:stored[key].settings.fontSize}); }
      catch(error){ const notice=document.createElement('p');notice.setAttribute('role','alert');notice.style.color='#a03746';notice.textContent='匯出失敗：'+error.message;document.getElementById('document').prepend(notice); }
      finally {extraExport.disabled=false;}
    });
    await chrome.storage.session.remove(key);
  } catch (error) {
    document.getElementById("document").textContent = `無法載入預覽：${error.message}`;
  }
})();
