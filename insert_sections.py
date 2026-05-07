import sys

with open('D:/project/astro/src/pages/thesis.astro', 'r', encoding='utf-8') as f:
    content = f.read()

def js_str(html):
    html = html.replace('\\', '\\\\')
    html = html.replace('"', '\\"')
    html = html.replace('\n', '\\r\\n')
    return html

tech_html = js_str("""
    <div class="section reveal">
        <div class="section-inner">
            <div class="section-label">技術指標補充</div>
            <h2 class="section-title">布林通道 · MACD · KD · 籌碼面 — 輔助進場確認</h2>
            <p class="section-sub">PPTS 以統計利潤分布識別買入區間，搭配技術面與籌碼面訊號可進一步提升進場品質。台股量化實戰案例顯示，「BBand 收斂 + KD 低檔回升 + MACD 動能翻正」三重共振型態，對應 PPTS 買入區間時，能有效過濾假突破、提升勝率。</p>
            <div class="indicator-grid">
                <div class="ind-card">
                    <div class="ind-icon">📊</div>
                    <div>
                        <div class="ind-title">布林通道 Bollinger Bands</div>
                        <div class="ind-body">上下軌 = MA20 ± 2σ，通道寬度代表市場波動程度。通道收斂（Width ≤ 70% 均寬）是即將變盤的預警訊號，收斂後突破方向往往延續。</div>
                        <div class="ind-signal">收斂訊號：Width ≤ 均寬 × 0.70</div>
                    </div>
                </div>
                <div class="ind-card">
                    <div class="ind-icon">📉</div>
                    <div>
                        <div class="ind-title">MACD 動能指標</div>
                        <div class="ind-body">DIF = EMA12 − EMA26，Signal = EMA9(DIF)，OSC = DIF − Signal。OSC 直方圖由紅轉綠（負翻正）代表短期動能開始回升，是早期多方確認。</div>
                        <div class="ind-signal">確認訊號：OSC 由負轉正（柱狀翻綠）</div>
                    </div>
                </div>
                <div class="ind-card">
                    <div class="ind-icon">🎯</div>
                    <div>
                        <div class="ind-title">KD 隨機指標</div>
                        <div class="ind-body">RSV 計算最近 9 日相對位置，K = 2/3 × K_prev + 1/3 × RSV，D = 2/3 × D_prev + 1/3 × K。K 值從低檔向上穿越 D 值為黃金交叉，代表超賣後動能反轉。</div>
                        <div class="ind-signal">黃金交叉：K 由低檔上穿 D（K &lt; 50）</div>
                    </div>
                </div>
                <div class="ind-card">
                    <div class="ind-icon">🏦</div>
                    <div>
                        <div class="ind-title">籌碼面 — 法人動向</div>
                        <div class="ind-body">外資 + 投信 + 自營商連續買超為多方籌碼訊號。主力買超千張以上且散戶同步賣超，代表聰明錢在低檔積累，是底部反轉候選股的關鍵條件之一。</div>
                        <div class="ind-signal">多方籌碼：法人連 3 日淨買超</div>
                    </div>
                </div>
            </div>
            <div class="grid-2" style="margin-top:18px">
                <div class="card">
                    <div class="card-title">所選個股 · 布林通道（測試集）</div>
                    <div class="card-note">實線為收盤價，橙色虛線為布林上下軌，半透明帶為通道範圍。通道收窄時即將面臨方向性突破。</div>
                    <div class="chart-box"><canvas id="bbandChart"></canvas></div>
                </div>
                <div class="card">
                    <div class="card-title">KD 隨機指標 + MACD OSC（測試集）</div>
                    <div class="card-note">藍/橙線為 K/D 值（左軸 0–100），綠/紅直方圖為 MACD OSC（右軸）。</div>
                    <div class="chart-box"><canvas id="macdKdChart"></canvas></div>
                </div>
            </div>
            <div class="card" style="margin-top:14px">
                <div class="card-title">三重共振訊號偵測 — 同時滿足 ≥ 2 項技術條件</div>
                <div class="card-note">偵測測試集中同時達到「BBand 收斂 + KD 黃金交叉 + MACD OSC 翻正」中至少兩項的訊號點，為 PPTS 買入區間提供技術面輔助確認。</div>
                <div id="tripleSignalPanel" class="triple-signal-grid"></div>
            </div>
        </div>
    </div>
""")

deriv_html = js_str("""
    <div class="section reveal">
        <div class="section-inner">
            <div class="section-label">衍生性商品延伸</div>
            <h2 class="section-title">權證 vs 選擇權 — GAPPTS 策略延伸討論</h2>
            <p class="section-sub">GAPPTS 以價格區間識別方向性進場機會，除現股之外可搭配衍生性商品放大槓桿。台灣市場中，選擇權（台指選 TXO）在定價透明度與流動性上遠優於個股權證，更適合量化策略重複執行與歷史回測驗證。</p>
            <div class="card">
                <div class="card-title">量化策略適用性比較：權證 vs 選擇權</div>
                <div style="overflow-x:auto;margin-top:12px">
                    <table style="width:100%;border-collapse:collapse;font-size:.84rem">
                        <thead>
                            <tr style="border-bottom:2px solid var(--border);color:var(--muted);text-align:left">
                                <th style="padding:10px 12px">特性</th>
                                <th style="padding:10px 12px">權證 (Warrant)</th>
                                <th style="padding:10px 12px">選擇權 (Option)</th>
                                <th style="padding:10px 12px">量化適用</th>
                            </tr>
                        </thead>
                        <tbody id="derivativesTable"></tbody>
                    </table>
                </div>
            </div>
            <div class="grid-2" style="margin-top:14px">
                <div class="card">
                    <div class="card-title">台積電假設情境損益比較（買方）</div>
                    <div class="card-note">現價 1000 元，履約價 1050，比較三種到期情境下的損益比。選擇權因 IV 公平定價，漲幅情境報酬明顯優於權證。</div>
                    <div class="chart-box"><canvas id="derivativesPayoffChart"></canvas></div>
                </div>
                <div class="card">
                    <div class="card-title">GAPPTS 延伸至衍生商品的操作建議</div>
                    <div id="derivativesAdvicePanel" style="margin-top:8px"></div>
                </div>
            </div>
        </div>
    </div>
""")

tools_html = js_str("""
    <div class="section reveal">
        <div class="section-inner">
            <div class="section-label">資源整理</div>
            <h2 class="section-title">投資研究工具全覽 · 今日重點複習</h2>
            <p class="section-sub">從總體經濟到個股分析，面對龐雜的財經資訊，善用對的工具能大幅提升研究效率。以下整理今日介紹的實用工具，建議依據自己的需求組合搭配使用。</p>
            <div class="macro-notice">
                <div class="macro-notice-icon">🌐</div>
                <div>
                    <strong style="color:var(--teal)">總經局勢</strong>：掌握大環境方向是個股分析的基礎。總體經濟數據（GDP、通膨、利率、PMI）的趨勢變化，會直接影響資金流向與產業輪動節奏。建議定期追蹤總經指標，由上而下選股，搭配附上的圖卡一起複習今日總經重點。
                </div>
            </div>
            <div class="tools-category">
                <div class="tools-category-label">📊 投資與數據分析工具</div>
                <div class="tools-grid">
                    <div class="tool-card">
                        <div class="tool-card-icon">📈</div>
                        <div class="tool-card-name">財經 M 平方</div>
                        <div class="tool-card-desc">專注於「總體經濟」數據與趨勢分析，提供全球 GDP、通膨、利率、PMI 等關鍵指標視覺化，掌握大方向的必備工具。</div>
                        <span class="tool-card-tag">總體經濟</span>
                    </div>
                    <div class="tool-card">
                        <div class="tool-card-icon">🐕</div>
                        <div class="tool-card-name">財報狗</div>
                        <div class="tool-card-desc">專精於「企業財報分析」，提供台股個股損益表、資產負債表、現金流量表整理，是研究基本面、檢視公司體質的好幫手。</div>
                        <span class="tool-card-tag">基本面分析</span>
                    </div>
                    <div class="tool-card">
                        <div class="tool-card-icon">💻</div>
                        <div class="tool-card-name">XQ 全球贏家</div>
                        <div class="tool-card-desc">強大的「股票分析」軟體，涵蓋即時看盤、技術指標、籌碼動向與程式交易，電腦版與手機版皆有。</div>
                        <span class="tool-card-tag">技術分析 · 籌碼</span>
                    </div>
                    <div class="tool-card">
                        <div class="tool-card-icon">⚡</div>
                        <div class="tool-card-name">金十數據 APP</div>
                        <div class="tool-card-desc">提供即時且快速的全球財經新聞與數據庫，消息面追蹤效率高，適合需要即時掌握市場動態的投資人。</div>
                        <span class="tool-card-tag">即時財經新聞</span>
                        <div class="tool-card-warning">⚠ 中國大陸開發軟體，對資安或隱私有疑慮者請審慎評估後再決定是否下載使用。</div>
                    </div>
                </div>
            </div>
            <div class="tools-category">
                <div class="tools-category-label">💡 補充與輔助工具</div>
                <div class="tools-grid">
                    <div class="tool-card">
                        <div class="tool-card-icon">🚦</div>
                        <div class="tool-card-name">處置王 APP</div>
                        <div class="tool-card-desc">專門查詢股票「何時被列入處置」的工具，避免在處置期間發生非預期的交易限制，對留意個股流動性風險非常實用。</div>
                        <span class="tool-card-tag">處置股票查詢</span>
                    </div>
                    <div class="tool-card" style="border-color:rgba(123,240,190,0.22)">
                        <div class="tool-card-icon">🤖</div>
                        <div class="tool-card-name">Claude · Gemini · Notebook LM</div>
                        <div class="tool-card-desc">強大的 AI 生產力助手。可快速整理龐雜財經資訊、總結長篇報告重點、梳理投資邏輯，善用 AI 能大幅提升研究效率，打破舊有思考框架，看見更多投資機會。</div>
                        <span class="tool-card-tag" style="background:rgba(123,240,190,.1);color:var(--green);border-color:rgba(123,240,190,.25)">AI 輔助工具</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
""")

new_sections = tech_html + deriv_html + tools_html

marker = '    <div id=\\"market-ops\\"'
idx = content.find(marker)
print(f"market-ops idx: {idx}")

if idx == -1:
    print("ERROR: marker not found!")
    sys.exit(1)

new_content = content[:idx] + new_sections + content[idx:]

with open('D:/project/astro/src/pages/thesis.astro', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Done! Inserted {len(new_sections)} chars.")
print(f"File: {len(content)} -> {len(new_content)} chars.")
