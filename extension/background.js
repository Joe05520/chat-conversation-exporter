chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)(?:\/|$)/.test(tab.url || "")) {
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
  } catch (error) {
    console.error("無法開啟對話選取工具：", error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CREATE_PREVIEW") return;
  (async () => {
    const id = crypto.randomUUID();
    await chrome.storage.session.set({ [`preview_${id}`]: message.payload });
    const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(`preview.html?id=${encodeURIComponent(id)}`) });
    sendResponse({ ok: true, tabId: tab.id });
  })().catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});

// Only the ChatGPT image proxy is allowed; this is not a general URL fetch proxy.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'READ_CHATGPT_IMAGE') return;
  (async () => {
    const page = new URL(sender.tab?.url || sender.url || '');
    const url = new URL(message.url);
    if (!['https://chatgpt.com','https://chat.openai.com'].includes(page.origin) || url.origin !== 'https://images.openai.com' || url.username || url.password) throw new Error('圖片來源不允許');
    const response = await fetch(url.href,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('圖片來源回應 HTTP '+response.status);
    const type = (response.headers.get('content-type') || '').split(';')[0];
    if (!/^image\/(png|jpeg|webp|gif|avif|svg\+xml)$/.test(type)) throw new Error('來源不是支援的圖片');
    const limit=20*1024*1024;
    if (Number(response.headers.get('content-length'))>limit) throw new Error('圖片超過20MB');
    const reader=response.body.getReader();const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('圖片超過20MB');}chunks.push(value);}
    let binary='';for(const bytes of chunks)for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
    sendResponse({ok:true,data:'data:'+type+';base64,'+btoa(binary)});
  })().catch(error=>sendResponse({ok:false,error:String(error.message)}));
  return true;
});
