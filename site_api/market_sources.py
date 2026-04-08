from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
import json
import re
from urllib.parse import quote

import requests
import urllib3


TWSE_STOCK_DAY_URL = "https://www.twse.com.tw/exchangeReport/STOCK_DAY"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
REQUEST_TIMEOUT = 20
USER_AGENT = "donttalk-api/1.0"
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


@dataclass(slots=True)
class MarketInstrumentPayload:
    asset_type: str
    source_name: str
    symbol: str
    display_name: str
    market: str
    currency: str
    exchange_name: str
    reference_url: str
    metadata_text: str


@dataclass(slots=True)
class MarketBarPayload:
    source_name: str
    symbol: str
    asset_type: str
    market: str
    trade_date: str
    open_price: float | None
    high_price: float | None
    low_price: float | None
    close_price: float | None
    settlement_price: float | None
    volume: int | None
    turnover: float | None
    open_interest: int | None
    change_value: float | None
    raw_payload: str


def _month_starts(months: int) -> list[date]:
    months = max(1, min(months, 12))
    today = date.today().replace(day=1)
    values: list[date] = []

    year = today.year
    month = today.month
    for _ in range(months):
        values.append(date(year, month, 1))
        month -= 1
        if month == 0:
            month = 12
            year -= 1

    values.reverse()
    return values


def _parse_float(value: object) -> float | None:
    normalized = str(value or "").strip()
    if not normalized or normalized in {"--", "---", "N/A", "null"}:
        return None

    normalized = normalized.replace(",", "")
    normalized = normalized.replace("X", "")
    normalized = normalized.replace("＋", "+").replace("－", "-")
    normalized = normalized.replace("△", "").replace("▲", "")
    normalized = normalized.replace("▽", "-").replace("▼", "-")

    try:
        return float(normalized)
    except ValueError:
        return None


def _parse_int(value: object) -> int | None:
    parsed = _parse_float(value)
    if parsed is None:
        return None
    return int(parsed)


def _roc_date_to_iso(value: str) -> str | None:
    normalized = str(value or "").strip()
    if not normalized:
        return None

    parts = normalized.split("/")
    if len(parts) != 3:
        return None

    try:
        year = int(parts[0]) + 1911
        month = int(parts[1])
        day = int(parts[2])
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _extract_twse_name(title: str, symbol: str) -> str:
    normalized = " ".join(str(title or "").split())
    if symbol not in normalized:
        return symbol

    trailing = normalized.split(symbol, 1)[1]
    name = trailing.split("各日成交資訊", 1)[0].strip()
    return name or symbol


def is_twse_symbol(symbol: str) -> bool:
    normalized = str(symbol or "").strip()
    return normalized.isdigit() and 4 <= len(normalized) <= 6


def _get_json(url: str, *, params: dict[str, str]) -> dict:
    headers = {"User-Agent": USER_AGENT}
    try:
        response = requests.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.SSLError:
        response = requests.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT, verify=False)
        response.raise_for_status()
        return response.json()


def fetch_twse_daily_records(symbol: str, asset_type: str, months: int) -> tuple[MarketInstrumentPayload, list[MarketBarPayload]]:
    bar_map: dict[str, MarketBarPayload] = {}
    instrument_name = symbol
    metadata_snapshots: list[dict[str, object]] = []

    for month_start in _month_starts(months):
        payload = _get_json(
            TWSE_STOCK_DAY_URL,
            params={
                "response": "json",
                "date": month_start.strftime("%Y%m%d"),
                "stockNo": symbol,
            },
        )

        stat = str(payload.get("stat") or "").strip().upper()
        if stat and stat != "OK":
            continue

        title = str(payload.get("title") or "").strip()
        if title:
            instrument_name = _extract_twse_name(title, symbol)

        fields = payload.get("fields") or []
        data_rows = payload.get("data") or []
        metadata_snapshots.append({
            "date": month_start.strftime("%Y-%m"),
            "title": title,
            "notes": payload.get("notes") or [],
            "total": payload.get("total"),
        })

        for row in data_rows:
            trade_date = _roc_date_to_iso(str(row[0] if len(row) > 0 else ""))
            if not trade_date:
                continue

            raw_payload = json.dumps({"fields": fields, "row": row}, ensure_ascii=False)
            bar_map[trade_date] = MarketBarPayload(
                source_name="TWSE",
                symbol=symbol,
                asset_type=asset_type,
                market="TWSE",
                trade_date=trade_date,
                open_price=_parse_float(row[3] if len(row) > 3 else None),
                high_price=_parse_float(row[4] if len(row) > 4 else None),
                low_price=_parse_float(row[5] if len(row) > 5 else None),
                close_price=_parse_float(row[6] if len(row) > 6 else None),
                settlement_price=None,
                volume=_parse_int(row[1] if len(row) > 1 else None),
                turnover=_parse_float(row[2] if len(row) > 2 else None),
                open_interest=None,
                change_value=_parse_float(row[7] if len(row) > 7 else None),
                raw_payload=raw_payload,
            )

    instrument = MarketInstrumentPayload(
        asset_type=asset_type,
        source_name="TWSE",
        symbol=symbol,
        display_name=instrument_name,
        market="TWSE",
        currency="TWD",
        exchange_name="Taiwan Stock Exchange",
        reference_url=f"https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&stockNo={symbol}",
        metadata_text=json.dumps(metadata_snapshots, ensure_ascii=False),
    )
    bars = [bar_map[key] for key in sorted(bar_map.keys())]
    return instrument, bars


def fetch_yahoo_daily_records(symbol: str, asset_type: str, range_name: str) -> tuple[MarketInstrumentPayload, list[MarketBarPayload]]:
    payload = _get_json(
        YAHOO_CHART_URL.format(symbol=quote(symbol, safe="")),
        params={
            "interval": "1d",
            "range": range_name,
            "includePrePost": "false",
            "events": "div,splits",
        },
    )

    result = (((payload.get("chart") or {}).get("result") or [None])[0])
    if not result:
        error_message = (((payload.get("chart") or {}).get("error") or {}).get("description") or "Unknown Yahoo Finance error")
        raise requests.HTTPError(f"Yahoo Finance chart response missing result for {symbol}: {error_message}")

    meta = result.get("meta") or {}
    quote_data = (((result.get("indicators") or {}).get("quote") or [{}])[0])
    timestamps = result.get("timestamp") or []

    opens = quote_data.get("open") or []
    highs = quote_data.get("high") or []
    lows = quote_data.get("low") or []
    closes = quote_data.get("close") or []
    volumes = quote_data.get("volume") or []

    previous_close: float | None = None
    bars: list[MarketBarPayload] = []
    for index, timestamp in enumerate(timestamps):
        try:
            trade_date = datetime.utcfromtimestamp(int(timestamp)).date().isoformat()
        except (TypeError, ValueError, OSError):
            continue

        open_price = _parse_float(opens[index] if index < len(opens) else None)
        high_price = _parse_float(highs[index] if index < len(highs) else None)
        low_price = _parse_float(lows[index] if index < len(lows) else None)
        close_price = _parse_float(closes[index] if index < len(closes) else None)
        volume = _parse_int(volumes[index] if index < len(volumes) else None)
        change_value = None
        if close_price is not None and previous_close is not None:
            change_value = round(close_price - previous_close, 4)
        if close_price is not None:
            previous_close = close_price

        if open_price is None and high_price is None and low_price is None and close_price is None:
            continue

        bars.append(
            MarketBarPayload(
                source_name="YahooFinance",
                symbol=symbol,
                asset_type=asset_type,
                market=str(meta.get("exchangeName") or meta.get("fullExchangeName") or "YahooFinance").strip(),
                trade_date=trade_date,
                open_price=open_price,
                high_price=high_price,
                low_price=low_price,
                close_price=close_price,
                settlement_price=None,
                volume=volume,
                turnover=None,
                open_interest=None,
                change_value=change_value,
                raw_payload=json.dumps(
                    {
                        "timestamp": timestamp,
                        "open": open_price,
                        "high": high_price,
                        "low": low_price,
                        "close": close_price,
                        "volume": volume,
                    },
                    ensure_ascii=False,
                ),
            )
        )

    instrument = MarketInstrumentPayload(
        asset_type=asset_type,
        source_name="YahooFinance",
        symbol=symbol,
        display_name=str(meta.get("shortName") or meta.get("symbol") or symbol).strip(),
        market=str(meta.get("exchangeName") or meta.get("fullExchangeName") or "YahooFinance").strip(),
        currency=str(meta.get("currency") or "").strip(),
        exchange_name=str(meta.get("fullExchangeName") or meta.get("exchangeName") or "Yahoo Finance").strip(),
        reference_url=f"https://finance.yahoo.com/quote/{quote(symbol, safe='')}",
        metadata_text=json.dumps(
            {
                "instrumentType": meta.get("instrumentType"),
                "regularMarketPrice": meta.get("regularMarketPrice"),
                "chartPreviousClose": meta.get("chartPreviousClose"),
                "validRanges": meta.get("validRanges") or [],
            },
            ensure_ascii=False,
        ),
    )
    return instrument, bars


def fetch_market_records(
    symbol: str,
    asset_type: str,
    twse_months: int,
    yahoo_range: str,
) -> tuple[MarketInstrumentPayload, list[MarketBarPayload]]:
    normalized_symbol = str(symbol or "").strip().upper()
    if not normalized_symbol:
        raise ValueError("symbol is required")

    if asset_type in {"stock", "etf"} and is_twse_symbol(normalized_symbol):
        try:
            instrument, bars = fetch_twse_daily_records(normalized_symbol, asset_type, twse_months)
            if bars:
                return instrument, bars
        except Exception:
            pass
        return fetch_yahoo_daily_records(f"{normalized_symbol}.TW", asset_type, yahoo_range)

    return fetch_yahoo_daily_records(normalized_symbol, asset_type, yahoo_range)