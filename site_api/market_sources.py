from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from html.parser import HTMLParser
import json
import re
from urllib.parse import quote

import requests

from site_api.http_client import get as http_get
import urllib3


TWSE_STOCK_DAY_URL = "https://www.twse.com.tw/exchangeReport/STOCK_DAY"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
TAIFEX_DAILY_REPORT_URL = "https://www.taifex.com.tw/cht/3/futDailyMarketReport"
TAIFEX_CONTRACT_OPTIONS_URL = "https://www.taifex.com.tw/cht/3/getFutcontract"
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
    contract_month: str
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


@dataclass(slots=True)
class TaifexContractResolution:
    requested_symbol: str
    commodity_code: str
    display_name: str
    asset_hint: str


class TableCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_table = False
        self.in_cell = False
        self.current_row: list[str] = []
        self.current_rows: list[list[str]] = []
        self.tables: list[list[list[str]]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "table":
            self.in_table = True
            self.current_rows = []
        elif tag == "tr" and self.in_table:
            self.current_row = []
        elif tag in {"td", "th"} and self.in_table:
            self.in_cell = True
            self.current_row.append("")

    def handle_data(self, data: str) -> None:
        if self.in_cell and self.current_row:
            self.current_row[-1] += data.strip()

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"}:
            self.in_cell = False
        elif tag == "tr" and self.in_table and any(cell.strip() for cell in self.current_row):
            self.current_rows.append([cell.strip() for cell in self.current_row])
        elif tag == "table" and self.in_table:
            if self.current_rows:
                self.tables.append(self.current_rows)
            self.in_table = False


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


def _normalize_taifex_header(value: str) -> str:
    normalized = re.sub(r"\s+", "", str(value or "").strip())
    return normalized.replace("*", "")


def _get_text(url: str, *, params: dict[str, str]) -> str:
    headers = {"User-Agent": USER_AGENT}
    try:
        response = http_get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        response.encoding = response.apparent_encoding or response.encoding
        return response.text
    except requests.exceptions.SSLError:
        response = http_get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT, verify=False)
        response.raise_for_status()
        response.encoding = response.apparent_encoding or response.encoding
        return response.text


def _collect_tables(html: str) -> list[list[list[str]]]:
    collector = TableCollector()
    collector.feed(html)
    return collector.tables


def _extract_taifex_option_pairs(html: str) -> list[tuple[str, str]]:
    matches = re.findall(r"<option[^>]+value=\"([^\"]+)\"[^>]*>(.*?)</option>", html, flags=re.IGNORECASE | re.DOTALL)
    pairs: list[tuple[str, str]] = []
    for raw_value, raw_label in matches:
        value = str(raw_value or "").strip().upper()
        label = re.sub(r"<[^>]+>", "", str(raw_label or "")).strip()
        if value and label:
            pairs.append((value, label))
    return pairs


@lru_cache(maxsize=1)
def _fetch_taifex_contract_catalog() -> dict[str, dict[str, str]]:
    responses: list[str] = []
    candidate_dates = [
        date.today().strftime("%Y/%m/%d"),
        (date.today() - timedelta(days=1)).strftime("%Y/%m/%d"),
        "2024/04/08",
    ]

    option_pairs: list[tuple[str, str]] = []
    for query_date in candidate_dates:
        for commodity_code in ("TX", "MTX"):
            try:
                html = _get_text(
                    TAIFEX_DAILY_REPORT_URL,
                    params={
                        "queryType": "2",
                        "marketCode": "0",
                        "commodity_id": commodity_code,
                        "queryDate": query_date,
                    },
                )
            except Exception:
                continue

            option_pairs = _extract_taifex_option_pairs(html)
            if option_pairs:
                responses.append(html)
                break
        if option_pairs:
            break

    if not option_pairs:
        raise requests.HTTPError("TAIFEX contract catalog returned no option values.")

    code_to_label: dict[str, str] = {}
    underlying_to_code: dict[str, str] = {}
    mini_underlying_to_code: dict[str, str] = {}
    alias_to_code: dict[str, str] = {
        "TX": "TX",
        "TXF": "TX",
        "MTX": "MTX",
        "MXF": "MTX",
    }

    for code, label in option_pairs:
        normalized_code = code.strip().upper()
        normalized_label = " ".join(label.split())
        if not normalized_code or normalized_code.startswith("SPECIALID"):
            continue

        code_to_label[normalized_code] = normalized_label
        alias_to_code.setdefault(normalized_code, normalized_code)

        match = re.match(r"^(\d{4,6})", normalized_label)
        if not match:
            continue

        underlying_symbol = match.group(1)
        if "小型" in normalized_label:
            mini_underlying_to_code[underlying_symbol] = normalized_code
            continue

        underlying_to_code[underlying_symbol] = normalized_code

    for underlying_symbol, mini_code in mini_underlying_to_code.items():
        underlying_to_code.setdefault(underlying_symbol, mini_code)

    return {
        "code_to_label": code_to_label,
        "underlying_to_code": underlying_to_code,
        "alias_to_code": alias_to_code,
    }


def resolve_taifex_symbol(symbol: str) -> TaifexContractResolution | None:
    normalized_symbol = str(symbol or "").strip().upper()
    if not normalized_symbol:
        return None

    catalog = _fetch_taifex_contract_catalog()
    code_to_label = catalog.get("code_to_label") or {}
    underlying_to_code = catalog.get("underlying_to_code") or {}
    alias_to_code = catalog.get("alias_to_code") or {}

    if normalized_symbol in underlying_to_code:
        commodity_code = underlying_to_code[normalized_symbol]
        return TaifexContractResolution(
            requested_symbol=normalized_symbol,
            commodity_code=commodity_code,
            display_name=code_to_label.get(commodity_code, normalized_symbol),
            asset_hint="underlying",
        )

    mapped_code = alias_to_code.get(normalized_symbol, normalized_symbol)
    if mapped_code in code_to_label:
        return TaifexContractResolution(
            requested_symbol=normalized_symbol,
            commodity_code=mapped_code,
            display_name=code_to_label.get(mapped_code, normalized_symbol),
            asset_hint="contract_code",
        )

    return None


def _candidate_taifex_dates(months: int) -> list[date]:
    target_sessions = max(8, min(months, 6) * 18)
    max_calendar_days = max(16, min(months, 6) * 32 + 10)
    dates: list[date] = []
    current = date.today()
    checked_days = 0

    while len(dates) < target_sessions and checked_days < max_calendar_days:
        if current.weekday() < 5:
            dates.append(current)
        current -= timedelta(days=1)
        checked_days += 1

    return dates


def _locate_taifex_quote_table(tables: list[list[list[str]]], commodity_code: str) -> list[list[str]] | None:
    normalized_code = commodity_code.strip().upper()
    for table in tables:
        if len(table) < 2:
            continue
        headers = [_normalize_taifex_header(cell) for cell in table[0]]
        if "到期月份(週別)" not in headers:
            continue
        if "最後成交價" not in headers and "結算價" not in headers:
            continue
        if any(str(row[0] if row else "").strip().upper() == normalized_code for row in table[1:]):
            return table
    return None


def _get_row_cell(row: list[str], header_positions: dict[str, int], *header_names: str) -> str:
    for header_name in header_names:
        index = header_positions.get(_normalize_taifex_header(header_name))
        if index is None:
            continue
        if index < len(row):
            return row[index]
    return ""


def fetch_taifex_daily_records(symbol: str, asset_type: str, months: int) -> tuple[MarketInstrumentPayload, list[MarketBarPayload]]:
    resolution = resolve_taifex_symbol(symbol)
    if resolution is None:
        raise requests.HTTPError(f"No TAIFEX contract mapping found for {symbol}.")

    bar_map: dict[tuple[str, str], MarketBarPayload] = {}
    discovered_contract_months: set[str] = set()

    for trade_day in _candidate_taifex_dates(months):
        html = _get_text(
            TAIFEX_DAILY_REPORT_URL,
            params={
                "queryType": "2",
                "marketCode": "0",
                "commodity_id": resolution.commodity_code,
                "queryDate": trade_day.strftime("%Y/%m/%d"),
            },
        )
        quote_table = _locate_taifex_quote_table(_collect_tables(html), resolution.commodity_code)
        if quote_table is None:
            continue

        headers = quote_table[0]
        header_positions = {
            _normalize_taifex_header(header): index for index, header in enumerate(headers)
        }
        trade_date = trade_day.isoformat()

        for row in quote_table[1:]:
            if not row:
                continue

            row_code = str(row[0]).strip().upper()
            if row_code != resolution.commodity_code:
                continue

            contract_month = _get_row_cell(row, header_positions, "到期月份(週別)").strip()
            if not contract_month:
                continue

            discovered_contract_months.add(contract_month)
            raw_payload = json.dumps(
                {
                    "headers": headers,
                    "row": row,
                    "commodityCode": resolution.commodity_code,
                    "requestedSymbol": resolution.requested_symbol,
                },
                ensure_ascii=False,
            )
            bar_map[(trade_date, contract_month)] = MarketBarPayload(
                source_name="TAIFEX",
                symbol=resolution.requested_symbol,
                asset_type=asset_type,
                market="TAIFEX",
                contract_month=contract_month,
                trade_date=trade_date,
                open_price=_parse_float(_get_row_cell(row, header_positions, "開盤價")),
                high_price=_parse_float(_get_row_cell(row, header_positions, "最高價")),
                low_price=_parse_float(_get_row_cell(row, header_positions, "最低價")),
                close_price=_parse_float(_get_row_cell(row, header_positions, "最後成交價")),
                settlement_price=_parse_float(_get_row_cell(row, header_positions, "結算價")),
                volume=_parse_int(_get_row_cell(row, header_positions, "合計成交量", "一般交易時段成交量")),
                turnover=None,
                open_interest=_parse_int(_get_row_cell(row, header_positions, "未沖銷契約量")),
                change_value=_parse_float(_get_row_cell(row, header_positions, "漲跌價")),
                raw_payload=raw_payload,
            )

    if not bar_map:
        raise requests.HTTPError(f"TAIFEX daily report returned no rows for {symbol}.")

    instrument = MarketInstrumentPayload(
        asset_type=asset_type,
        source_name="TAIFEX",
        symbol=resolution.requested_symbol,
        display_name=resolution.display_name,
        market="TAIFEX",
        currency="TWD",
        exchange_name="Taiwan Futures Exchange",
        reference_url=TAIFEX_DAILY_REPORT_URL,
        metadata_text=json.dumps(
            {
                "commodityCode": resolution.commodity_code,
                "assetHint": resolution.asset_hint,
                "contractMonths": sorted(discovered_contract_months),
            },
            ensure_ascii=False,
        ),
    )
    bars = [bar_map[key] for key in sorted(bar_map.keys())]
    return instrument, bars


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
        response = http_get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.SSLError:
        response = http_get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT, verify=False)
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
                contract_month="",
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
            trade_date = datetime.fromtimestamp(int(timestamp), tz=timezone.utc).date().isoformat()
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
                contract_month="",
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

    if asset_type == "futures":
        taifex_resolution = resolve_taifex_symbol(normalized_symbol)
        if taifex_resolution is not None:
            return fetch_taifex_daily_records(normalized_symbol, asset_type, twse_months)
        if is_twse_symbol(normalized_symbol):
            raise requests.HTTPError(f"No official TAIFEX mapping found for futures symbol {normalized_symbol}.")
        return fetch_yahoo_daily_records(normalized_symbol, asset_type, yahoo_range)

    if asset_type in {"stock", "etf"} and is_twse_symbol(normalized_symbol):
        try:
            instrument, bars = fetch_twse_daily_records(normalized_symbol, asset_type, twse_months)
            if bars:
                return instrument, bars
        except Exception:
            pass
        return fetch_yahoo_daily_records(f"{normalized_symbol}.TW", asset_type, yahoo_range)

    return fetch_yahoo_daily_records(normalized_symbol, asset_type, yahoo_range)