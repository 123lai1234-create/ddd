---
title: "NGS 次世代定序：實驗設計到分析的完整思路"
description: "從定序深度估算、QC 指標判讀到變異偵測流程，整理一個可實際操作的 NGS 工作框架。"
date: 2026-02-10
tags: ["NGS", "生物資訊", "定序分析", "QC"]
---

## 為什麼實驗設計先於定序

很多人把 NGS 的難點放在後端分析，但其實**實驗設計的決策決定了分析能做到什麼**。

核心問題只有三個：
1. **你要問什麼問題？**（SNP？基因表達？染色質開放性？）
2. **你需要多少讀段？**（覆蓋深度估算）
3. **你需要多長的讀段？**（paired-end 150bp 還是 long-read？）

## 定序深度估算

### Whole Genome Sequencing (WGS)

人類基因組 ~3 Gb，一般 SNP calling 建議至少 30×：

```
需要的 reads = (3 × 10⁹ bp × 30) / 150 bp
             ≈ 6 × 10⁸ reads
             ≈ 600M reads / 樣本
```

### RNA-Seq

基因表達分析的深度取決於轉錄本複雜度：

| 目的 | 建議深度 |
|------|--------|
| 常見基因差異表達 | 20M reads |
| 低豐度轉錄本 | 50–100M reads |
| 全轉錄組結構分析 | 200M+ reads |

本站的 [NGS 計算機](/ngs) 整合了這些估算公式，可以互動輸入參數。

## QC 指標解讀

Fastqc 輸出的幾個關鍵指標：

- **Per-base sequence quality**：Q30 > 80% 為可接受標準。
- **Adapter content**：若尾端有 adapter，需要 Trimmomatic 或 fastp 修剪。
- **GC content**：與物種參考範圍偏差 > 10% 時，需警惕污染或文庫偏差。

## 變異偵測流程 (Variant Calling)

```
FASTQ → BWA-MEM → SAM/BAM → GATK HaplotypeCaller → VCF → 篩選與注釋
                      ↓
              Samtools sort + index
              Picard MarkDuplicates
              BQSR (Base Quality Score Recalibration)
```

每一步的輸出都需要 QC check，不能直接傳入下一步。
尤其是 duplicate rate > 30% 時，需要重新評估文庫製備。

## 小結

NGS 不是「把樣本送去定序，等結果回來」這麼簡單的事。
前期設計決策、中期 QC 把關、後期分析策略，三個環節缺一不可。

更多互動工具可以在[本站 NGS 頁面](/ngs)找到。
