# Browser regression fixture

從 repository 根目錄執行 `python3 -m http.server 8871 --bind 127.0.0.1`，在 Chrome 開啟 `http://127.0.0.1:8871/tests/table-image.html?id=test`。

此頁使用測試用 chrome API shim，在同一頁顯示匯出結果，不需要安裝擴充功能。它不代表真實網站權限或 Safari 整合已測試。

1. 執行擷取：應顯示第1則、第1張圖片失敗，無預覽。
2. 勾選略過失敗圖片，點預覽：應顯示摘要與原位置缺圖標記。
3. 兩個表格須在正文左右邊界內，長檔名可換行；A4 列印亦須符合。
4. JSON 應有 warnings，Markdown 應有提醒與標記。

使用合成資料，沒有私人對話或附件。
