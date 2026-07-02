import { fetchSummary } from "./yahoo";

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (v: unknown) => (typeof v === "number" ? r2(v * 100) : null);
const yi = (v: unknown) => (typeof v === "number" ? r2(v / 1e8) : null);
const fmtDate = (v: unknown) => {
  if (!v) return null;
  const d = new Date(v as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export async function buildIntro(
  code: string,
  name: string,
  ticker: string,
  industryTag: string | null,
) {
  const s = await fetchSummary(ticker, [
    "assetProfile",
    "price",
    "summaryDetail",
    "defaultKeyStatistics",
    "financialData",
  ]);
  const ap = (s?.assetProfile ?? {}) as Record<string, unknown>;
  const sd = (s?.summaryDetail ?? {}) as Record<string, number | undefined>;
  const ks = (s?.defaultKeyStatistics ?? {}) as Record<string, number | undefined>;
  const fd = (s?.financialData ?? {}) as Record<string, number | undefined>;
  const priceMod = (s?.price ?? {}) as Record<string, number | undefined>;

  const shares = ks.sharesOutstanding as number | undefined;
  let dy = sd.dividendYield as number | undefined;
  if (dy != null && dy < 1) dy = dy * 100;

  return {
    code,
    name,
    industry_tag: industryTag,
    industry_tag_kind: industryTag ? "custom" : null,
    industry: (ap.industry as string) ?? (ap.sector as string) ?? null,
    market: ticker.endsWith(".TWO") ? "上櫃 (TPEx)" : "上市 (TWSE)",
    capital: shares != null ? shares * 10 : null,
    marketCap: priceMod.marketCap ?? sd.marketCap ?? null,
    listedYears: 0,
    website: (ap.website as string) ?? null,
    bookValue: (ks.bookValue as number) ?? null,
    priceToBook: (ks.priceToBook as number) ?? (sd.priceToBook as number) ?? null,
    eps: (ks.trailingEps as number) ?? null,
    pe: (sd.trailingPE as number) ?? null,
    dividendYield: dy ?? null,
    roe: pct(fd.returnOnEquity),
    roa: pct(fd.returnOnAssets),
    grossMargin: pct(fd.grossMargins),
    operatingMargin: pct(fd.operatingMargins),
    profitMargin: pct(fd.profitMargins),
  };
}

export async function buildFinancial(code: string, name: string, ticker: string) {
  const s = await fetchSummary(ticker, [
    "price",
    "summaryDetail",
    "defaultKeyStatistics",
    "financialData",
    "calendarEvents",
    "cashflowStatementHistory",
  ]);

  const fd = (s?.financialData ?? {}) as Record<string, number | string | undefined>;
  const sd = (s?.summaryDetail ?? {}) as Record<string, number | undefined>;
  const ks = (s?.defaultKeyStatistics ?? {}) as Record<string, number | undefined>;
  const ce = (s?.calendarEvents ?? {}) as Record<string, unknown>;
  const cf = (s?.cashflowStatementHistory ?? {}) as {
    cashflowStatements?: Record<string, number>[];
  };
  const priceMod = (s?.price ?? {}) as Record<string, number | undefined>;

  const price = (fd.currentPrice as number) ?? priceMod.regularMarketPrice ?? null;

  const numA = (fd.numberOfAnalystOpinions as number) ?? 0;
  const targetMean = fd.targetMeanPrice as number | undefined;
  const analyst =
    numA > 0
      ? {
          available: true,
          current_price: price,
          num_analysts: numA,
          recommend: fd.recommendationKey ?? null,
          recommend_key: fd.recommendationKey ?? null,
          target_high: fd.targetHighPrice ?? null,
          target_low: fd.targetLowPrice ?? null,
          target_mean: targetMean ?? null,
          upside_pct:
            price && targetMean ? r2(((targetMean - price) / price) * 100) : null,
        }
      : { available: false };

  const per = (sd.trailingPE as number) ?? null;
  const epsTtm = (ks.trailingEps as number) ?? null;
  const valuation =
    per != null
      ? {
          available: true,
          date: new Date().toISOString().slice(0, 10),
          eps_ttm: epsTtm,
          pbr: (ks.priceToBook as number) ?? (sd.priceToBook as number) ?? null,
          per,
          per_mean: null,
          per_std: null,
          fair_low: epsTtm ? r2(epsTtm * Math.max(per - 3, 5)) : null,
          fair_high: epsTtm ? r2(epsTtm * (per + 3)) : null,
        }
      : { available: false };

  const roe = pct(fd.returnOnEquity);
  const gross = pct(fd.grossMargins);
  const oper = pct(fd.operatingMargins);
  const financial_data = {
    // eps is a SCALAR TTM value (not a quarterly array). The frontend EPS-trend
    // chart must guard with Array.isArray before .slice; quarterly series is not
    // available from the Yahoo summary modules used here.
    eps: epsTtm,
    revenue: (fd.totalRevenue as number) ?? null,
    roe,
    gross_margin: gross,
    operating_margin: oper,
  };

  let dy = sd.dividendYield as number | undefined;
  if (dy != null && dy < 1) dy = dy * 100;
  const dividend =
    dy != null
      ? {
          available: true,
          yield_pct: r2(dy),
          cash_dividend:
            (sd.dividendRate as number) ?? (sd.trailingAnnualDividendRate as number) ?? null,
          ex_date: fmtDate(ce.exDividendDate),
          fill_days_avg: null,
          fill_days_list: [],
          fill_days_max: null,
        }
      : { available: false };

  const stmt = cf.cashflowStatements?.[0];
  const opCf = stmt?.totalCashFromOperatingActivities ?? null;
  const capex = stmt?.capitalExpenditures ?? null;
  const freeCf = opCf != null && capex != null ? opCf + capex : null;
  const cashflow = stmt
    ? {
        available: true,
        operating_cf: opCf,
        capex,
        free_cf: freeCf,
        operating_cf_yi: yi(opCf),
        free_cf_yi: yi(freeCf),
        cf_positive: freeCf != null ? freeCf > 0 : false,
      }
    : { available: false };

  const pegVal = ks.pegRatio as number | undefined;
  const peg =
    pegVal != null
      ? {
          available: true,
          peg: r2(pegVal),
          growth_rate: pct(fd.earningsGrowth),
          label: pegVal < 1 ? "被低估" : pegVal < 2 ? "合理" : "偏高",
          color: pegVal < 1 ? "#ff1744" : pegVal < 2 ? "#ffa726" : "#00c853",
        }
      : { available: false };

  let qScore = 50;
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (roe != null) {
    if (roe > 15) { qScore += 15; reasons.push(`ROE ${roe}% 優異`); }
    else if (roe < 5) { qScore -= 10; warnings.push(`ROE 偏低 ${roe}%`); }
  }
  if (gross != null && gross > 30) { qScore += 10; reasons.push(`毛利率 ${gross}%`); }
  if (oper != null && oper < 0) { qScore -= 15; warnings.push("營業利益率為負"); }
  if (cashflow.available && cashflow.cf_positive) { qScore += 10; reasons.push("自由現金流為正"); }
  qScore = Math.max(0, Math.min(100, qScore));
  const quality = {
    score: qScore,
    level: qScore >= 70 ? "優" : qScore >= 50 ? "中" : "弱",
    reasons,
    warnings,
  };

  let total = 0;
  const breakdown: { label: string; score: number }[] = [];
  if (analyst.available && (analyst as { upside_pct: number | null }).upside_pct != null) {
    const up = (analyst as { upside_pct: number }).upside_pct;
    const sc = up > 15 ? 2 : up > 0 ? 1 : up < -10 ? -2 : -1;
    total += sc;
    breakdown.push({ label: "分析師目標價", score: sc });
  }
  if (peg.available) {
    const sc = (peg as { peg: number }).peg < 1 ? 2 : (peg as { peg: number }).peg < 2 ? 1 : -1;
    total += sc;
    breakdown.push({ label: "PEG 評價", score: sc });
  }
  const qsc = qScore >= 70 ? 2 : qScore >= 50 ? 1 : -1;
  total += qsc;
  breakdown.push({ label: "體質評分", score: qsc });
  const combined = {
    total_score: total,
    recommendation: total >= 3 ? "偏多" : total <= -2 ? "偏空" : "中性",
    color: total >= 3 ? "#ff1744" : total <= -2 ? "#00c853" : "#9e9e9e",
    confidence: Math.min(100, 40 + Math.abs(total) * 12),
    breakdown,
  };

  return {
    code,
    name,
    analyst,
    valuation,
    financial_data,
    dividend,
    month_rev: { available: false },
    cashflow,
    balance: { available: false, reason: "資料來源未提供" },
    peg,
    quality,
    combined,
  };
}
