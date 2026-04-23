---
title: "ESM-2：蛋白質語言模型如何「讀懂」序列"
description: "從 Transformer 架構到蛋白質嵌入，解釋 ESM-2 為什麼能在不需要結構資訊的情況下捕捉進化約束。"
date: 2026-01-15
tags: ["Protein AI", "深度學習", "ESM-2", "Transformer"]
---

## 為什麼蛋白質需要語言模型？

傳統的序列分析工具（BLAST、HMMER）依賴進化資料庫的比對。但當你手上是一段全新設計的序列，
沒有同源蛋白可比對時，這些工具就失靈了。

蛋白質語言模型（PLM）用另一種方式看待序列：**把胺基酸當成「詞」，把序列當成「句子」**，
用大規模自監督學習從數億條序列中學到隱性的物理化學規律。

## ESM-2 架構解析

Meta 的 ESM-2 是目前最廣泛使用的開源 PLM。核心是 Transformer encoder：

```
輸入序列: M K T I I A L S Y I ...
   ↓ 胺基酸 tokenizer（詞彙表大小 = 33）
Token embeddings (d_model = 1280)
   ↓ L × Multi-head Self-Attention + FFN
每個位置的 embedding (d=1280)
   ↓ 平均池化 (mean pooling)
全序列 embedding (1280-dim 向量)
```

關鍵設計決策：
- **Rotary Position Embedding (RoPE)**：讓相對位置關係比絕對位置更準確。
- **Contact head**：在預訓練目標中加入殘基接觸預測，讓模型更關注結構性約束。
- **8M → 15B 參數多尺度**：小模型推理快、大模型精度高，可依任務選擇。

## 嵌入空間的意義

ESM-2 的 embedding 並非隨機數字，而是編碼了：

1. **功能保守性**：功能重要的位置（活性位點、二硫鍵）在嵌入空間中對擾動更敏感。
2. **結構偏好性**：α-helix 與 β-sheet 在嵌入空間的分布有可分離的模式。
3. **進化距離**：親緣關係越近的蛋白，其序列嵌入的餘弦相似度越高。

## 在本站的實際應用

本站的[蛋白質相似度 Demo](/index#esm-demo) 呼叫 HuggingFace Space 上的 ESM-2（8M），
讓你直接輸入兩段序列，計算語意相似度。

完整的蛋白質設計 Pipeline（含 Bayesian Optimization 和 ProteinMPNN）可以在
[蛋白質 AI 報告頁面](/report) 找到。

## 延伸閱讀

- Lin et al. (2023) *Evolutionary-scale prediction of atomic-level protein structure with a language model* — ESM-2 原始論文
- [ESM GitHub](https://github.com/facebookresearch/esm) — Meta 開源代碼庫
