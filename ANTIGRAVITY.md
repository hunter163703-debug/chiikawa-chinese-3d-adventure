# 吉伊卡哇 3D 生字語詞冒險遊戲模組 (Chiikawa 3D Learning Game Engine)

## 📌 模組簡介與架構說明

本專案為一套專為國小語文教學打造的 **吉伊卡哇 (Chiikawa) 3D 冒險書寫練習單一檔案網頁生成系統 (Single-File Web App Engine)**。
所有 3D 渲染 (Three.js)、純淨米字格書寫畫布 (Canvas)、Web Audio API 雙音階音效與 SpeechSynthesis 語音朗讀皆完全封裝在單一 `.html` 檔案中，完全不依賴後端伺服器，可在 iPad、手機與電腦瀏覽器上直接離線使用。

---

## 🛠️ 如何使用本模型為「不同課」製作新的遊戲網頁？

### 方法一：使用自動化 Python 產生器 (`generate_game.py`)

本專案內建自動化生成腳本 `generate_game.py`，支援從 Excel 教材 (`.xlsx`) 或 JSON 題庫一鍵產生新的遊戲網頁：

```powershell
# 範例：匯入第三課與第四課的 Excel 檔案產生新遊戲
python generate_game.py --l1 "第三課.xlsx" --l2 "第四課.xlsx" --title "三年級第三四課生字大冒險" --output "index.html"
```

### 方法二：直接替換 `index.html` 中的 `DATABASE` 資料庫

在 `index.html` 的 JavaScript 區塊中，找到 `const DATABASE = { ... }`，替換生字與語詞資料即可：

```javascript
const DATABASE = {
  lesson1: [
    {
      char: '生字 (目標字)',
      word: '語詞 (例如：走廊)',
      zhuyin: '注音 (例如：ㄌㄤˊ)',
      radical: '部首 (例如：广部)',
      question: '題目或情境描述 (例如：屋外有頂蓋的走道...)',
      meaning: '教育部辭典釋義或造句',
      distractors: ['干擾字1', '干擾字2', '干擾字3'] // 四選一測驗的其他選項
    },
    // ... 共 10 題
  ],
  lesson2: [
    // ... 第二課 10 題
  ]
};
```

---

## 🎮 3D 萌島探險與遊戲機制

1. **萌島 10 種不同探索物品**：
   - 🎁 **神祕糖果寶箱** (chest)
   - ⭐ **許願幸運星** (star)
   - 🍄 **幻彩魔力菇** (mushroom)
   - 💎 **奇蹟能量水晶** (crystal)
   - 🧁 **巨型草莓蛋糕** (cupcake)
   - 🌳 **守護精靈樹洞** (tree)
   - ⛲ **夢幻願望之泉** (fountain)
   - 🎡 **彩色旋轉風車** (windmill)
   - 💌 **浪花漂流瓶** (bottle)
   - 🌸 **巨型向陽花** (flower)

2. **隨機掉落鑰匙機制**：
   - 每次成功答對題目時，系統會**動態隨機給予 1 把【銀色鑰匙】🐾 或 1 把【金色鑰匙】🐰**。
   - 5 把銀色鑰匙：解開銀色籠子拯救小八貓。
   - 5 把金色鑰匙：解開金色籠子拯救烏薩奇。
   - 10 把鑰匙全齊：觸發大團圓煙火彩帶與榮譽證書。

3. **雙模式學習設計**：
   - **✍️ 書寫練字模式**：標準純淨米字格畫布，自主書寫（無任何筆畫提示洩題），配備粉紅/藍/黑筆刷、橡皮擦與清除按鈕。
   - **💡 提示與測驗模式**：提供部首提示、辭典釋義、四選一選項卡以及鍵盤打字輸入模式。

4. **正向回饋節奏 (Web Audio + TTS)**：
   - 即時 (0s)：Web Audio 清脆雙音階叮咚聲 (C5 -> G5)。
   - 延遲 0.6s：語音朗讀「答對了！」。
   - 延遲 0.8s：隨機鼓勵詞（「你真棒！」、「太強了！」、「一百分！」等）。
   - 延遲 2.0s：獲得鑰匙並推進冒險進度。

---

## 🚀 GitHub Pages 線上發布指南

本專案已發布至 GitHub Pages：
- **儲存庫**：`https://github.com/hunter163703-debug/chiikawa-chinese-3d-adventure`
- **線上網址**：`https://hunter163703-debug.github.io/chiikawa-chinese-3d-adventure/`
