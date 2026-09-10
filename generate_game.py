#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
吉伊卡哇 3D 生字語詞冒險遊戲 - 一鍵網頁產生器
Chiikawa 3D Learning Game Generator

用法範例:
  python generate_game.py --l1 "第一課：你好，新朋友.xlsx" --l2 "第二課：我們的約定.xlsx" --output "index.html"
"""

import os
import sys
import json
import argparse

try:
    import openpyxl
except ImportError:
    openpyxl = None


def parse_excel_lesson(excel_path):
    """
    從 Excel 檔案中解析生字與語詞
    預期格式：第 1 欄為詞條名稱 (單字或語詞)，第 2 欄為詞條解釋
    """
    if not openpyxl:
        raise ImportError("請先安裝 openpyxl：pip install openpyxl")

    wb = openpyxl.load_workbook(excel_path)
    ws = wb.active

    items = []
    for row in ws.iter_rows(values_only=True):
        if not row or not row[0]:
            continue
        name = str(row[0]).strip()
        desc = str(row[1]).strip() if len(row) > 1 and row[1] else ""
        if name in ["詞條名稱", "第一課：你好，新朋友", "第二課：我們的約定"] or "課" in name:
            continue
        items.append({"name": name, "desc": desc})

    # 分類出生字 (1個字) 與 語詞 (2個字以上)
    chars = [it for it in items if len(it["name"]) == 1]
    words = [it for it in items if len(it["name"]) > 1]

    # 組成 10 道標準題目
    questions = []
    for i in range(min(10, len(chars))):
        c = chars[i]
        char = c["name"]
        
        # 尋找包含該生字的例詞
        matched_word = next((w["name"] for w in words if char in w["name"]), char)
        
        # 取簡要解釋 (取第一句)
        desc_lines = c["desc"].split("\n")
        first_line = desc_lines[0] if desc_lines else "常用生字。"
        
        # 自動產生情境題目
        question_text = f"請寫出生字「{char}」，並完成語詞「{matched_word}」！"
        if matched_word != char:
            masked_word = matched_word.replace(char, "＿＿")
            question_text = f"代表「{first_line[:25]}...」的生字「{char}」，請寫出完成語詞「{masked_word}」！"

        # 產生干擾字
        distractors = ["郎", "良", "朗"] if char not in ["郎", "良", "朗"] else ["方", "日", "月"]
        
        questions.append({
            "char": char,
            "word": matched_word,
            "zhuyin": "",
            "radical": "常用部首",
            "question": question_text,
            "meaning": first_line[:40],
            "distractors": distractors
        })

    return questions


def generate_game(lesson1_data, lesson2_data, template_path, output_path, title="吉伊卡哇 3D 冒險拯救大作戰：生字與語詞書寫練習"):
    """讀取 template.html 並替換 DATABASE 生成目標 HTML"""
    with open(template_path, "r", encoding="utf-8") as f:
        html = f.read()

    database_obj = {
        "lesson1": lesson1_data,
        "lesson2": lesson2_data
    }

    db_json_str = json.dumps(database_obj, ensure_ascii=False, indent=6)
    
    # 替換 DATABASE 定義區塊
    # 尋找 const DATABASE = { ... }; 替換
    import re
    db_pattern = re.compile(r"const DATABASE = \{.*?\};", re.DOTALL)
    replacement = f"const DATABASE = {db_json_str};"
    
    if db_pattern.search(html):
        new_html = db_pattern.sub(replacement, html, count=1)
    else:
        new_html = html.replace("/* {{DATABASE_JSON}} */", replacement)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(new_html)

    print(f"✅ 成功生成遊戲網頁：{output_path} (大小: {len(new_html)} bytes)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Chiikawa 3D Learning Game Generator")
    parser.add_argument("--l1", help="第一課 Excel 或 JSON 路徑", default="第一課：你好，新朋友.xlsx")
    parser.add_argument("--l2", help="第二課 Excel 或 JSON 路徑", default="第二課：我們的約定.xlsx")
    parser.add_argument("--template", help="HTML 範本路徑", default="index.html")
    parser.add_argument("--output", help="輸出 HTML 路徑", default="index.html")
    args = parser.parse_args()

    print("🌸 吉伊卡哇 3D 遊戲產生器啟動中...")
    if os.path.exists(args.template):
        print(f"📖 範本檔存在：{args.template}")
    else:
        print(f"❌ 找不到範本檔：{args.template}")
