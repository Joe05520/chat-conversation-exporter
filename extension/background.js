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
