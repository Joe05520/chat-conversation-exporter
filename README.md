# Chat Conversation Exporter

<img src="assets/icon-128.png" width="96" alt="Chat Conversation Exporter icon">

ChatGPT 對話選取與匯出工具：PDF、Markdown、JSON。繁體中文介面，Chrome / Safari Web Extension 原始碼。非 OpenAI 官方產品。

## 功能

- 頁面列印入口：選取匯出或全部已載入訊息快速預覽（12 pt）。
- 搜尋、範圍、只選提問／回答、反選。
- 右上／右下位置，背景色、文字色、透明背景設定，自動保存。
- PDF 紙張、方向、邊界、目錄、每則換頁與文字遮蔽。
- 保留網頁已渲染的 Mermaid SVG、HTML 方塊圖與圖片。

## Chrome 安裝

1. 從 [Releases](../../releases/latest) 下載 Chrome ZIP，解壓縮。
2. 開啟 `chrome://extensions`，啟用開發人員模式。
3. 按「載入未封裝項目」，選擇 `extension` 資料夾。
4. 允許 ChatGPT 網站存取，重新整理聊天頁面。
5. 「列印／匯出」選取訊息；「全部」直接預覽。預覽頁可下載 MD / JSON 或列印儲存 PDF。
6. ⚙ 可設定按鈕位置、背景色、文字色、背景透明度。

更新：用新版 extension 資料夾替換舊內容，再到擴充功能頁重新載入並重新整理 ChatGPT。

## Safari（本機開發測試版）

`safari/ChatGPT Export/ChatGPT Export.xcodeproj` 可用 Xcode 編譯。Release 的 Safari ZIP 包含 ad-hoc 簽署 App，未經 Developer ID 公證或 App Store 發布。

將 App 放入應用程式資料夾、開啟並進入 Safari 延伸功能設定。需要自行在 Safari 開发者設定啟用「允許未簽署的延伸功能」，再勾選本工具並允許 ChatGPT 網站。此設定允許未簽署本機擴充功能，請了解後決定是否啟用。Safari 可能在重新開啟後要求重新允許。

編譯指令：

```sh
xcodebuild -project "safari/ChatGPT Export/ChatGPT Export.xcodeproj" -scheme "ChatGPT Export" -configuration Debug CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- build
```

## 支援範圍與驗證

Chrome 本機回答 DOM 快照已驗證選取、圖解版面、快捷匯出12pt、位置與透明背景。Safari 原生專案編譯與簽章結構檢查通過，Safari 網站實際匯出尚未驗證。

長對話需先捲動載入，工具不保證未載入歷史訊息完整。互動圖僅保留目前步驟。Markdown 包含 HTML / SVG，閱讀器需要支援；JSON 是文字與結構，非圖形閱讀格式。未渲染、跨來源 iframe 或不支援圖形可能無法匯出。原生 ChatGPT 桌面 App 不支援注入本工具按鈕。

## 授權與隱私

[MIT License](LICENSE) · [隱私說明](PRIVACY.md)。專案含 AI 協助產生的程式與圖示，請依自身需求檢查使用。
