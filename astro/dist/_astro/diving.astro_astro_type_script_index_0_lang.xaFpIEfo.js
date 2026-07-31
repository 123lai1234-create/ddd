const et="Asia%2FTaipei";function pt(){const t=document.querySelectorAll(".site-tab");return Array.from(t).map(e=>({id:e.getAttribute("data-site-id"),name:e.getAttribute("data-site-name"),lat:parseFloat(e.getAttribute("data-site-lat")),lon:parseFloat(e.getAttribute("data-site-lon")),buoyMID:e.getAttribute("data-site-buoy")||null})).filter(e=>e.id&&!isNaN(e.lat)&&!isNaN(e.lon))}const Z=pt();function Q(t){return Z.find(e=>e.id===t)||Z[0]}function P(t){return t==null?"#3a3f4b":t<2.5?"#1a4d2e":t<5?"#3fb950":t<8?"#d29922":t<11?"#db6d28":"#f85149"}function _(t){return t==null?"#aaa":t<5?"#0d1d10":"#fff"}function R(t){return t==null?"#3a3f4b":t<.6?"#1a4d2e":t<1?"#3fb950":t<1.4?"#d29922":t<1.8?"#db6d28":"#f85149"}function ot(t){return t==null?"#3a3f4b":t<5?"#f85149":t<7?"#db6d28":t<9?"#d29922":t<12?"#3fb950":"#1a4d2e"}function rt(t){return t==null?"#3a3f4b":t<20?"#f85149":t<24?"#58a6c4":t<=28?"#3fb950":t<=30?"#d29922":"#db6d28"}function J(t){return t==null?"·":["↑","↗","⇗","→","⇘","↘","⇙","↓","⇙","↙","⇙","←","⇖","↖","⇖","↑"][Math.round(t%360/22.5)%16]}function z(t){return t==null?"unknown":t>=60&&t<=130?"onshore":t>=240&&t<=300?"offshore":"cross-shore"}function lt(t){return{onshore:"迎岸",offshore:"離岸","cross-shore":"沿岸",unknown:"?"}[t]}async function ht(t){const e=`https://marine-api.open-meteo.com/v1/marine?latitude=${t.lat}&longitude=${t.lon}&hourly=wave_height,wave_period,wave_direction,sea_surface_temperature&forecast_days=10&timezone=${et}`,a=`https://api.open-meteo.com/v1/forecast?latitude=${t.lat}&longitude=${t.lon}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,precipitation,cloud_cover&forecast_days=10&timezone=${et}&wind_speed_unit=ms`,[r,l]=await Promise.all([fetch(e).then(n=>n.json()),fetch(a).then(n=>n.json())]);if(!r.hourly||!l.hourly)throw new Error("Open-Meteo 回傳結構異常");const s=l.hourly.time,u=[];for(let n=0;n<s.length;n++)u.push({siteId:t.id,t:s[n],date:new Date(s[n]),hour:new Date(s[n]).getHours(),windMs:l.hourly.wind_speed_10m[n],gustMs:l.hourly.wind_gusts_10m[n],windDeg:l.hourly.wind_direction_10m[n],tempC:l.hourly.temperature_2m[n],precip:l.hourly.precipitation[n],cloud:l.hourly.cloud_cover[n],waveM:r.hourly.wave_height[n],wavePer:r.hourly.wave_period[n],waveDir:r.hourly.wave_direction[n],sstC:r.hourly.sea_surface_temperature?.[n]});return u}let j=null;function yt(t){if(j&&j.mid===t)return j.promise;const e=`https://www.cwa.gov.tw/Data/js/marine/48hr_plot/ChartData_48hr_${t}.js`,a=new Promise((r,l)=>{const s=document.createElement("script");s.src=e+"?t="+Date.now();let u=!1;const n=()=>{try{s.remove()}catch{}},o="Data_Array_48hr";s.onload=()=>{u=!0,n();const f=window[o];try{delete window[o]}catch{}if(!f||!f.time){l(new Error(`CWA ${t}: ${o} 缺失`));return}r(f)},s.onerror=()=>{u||(u=!0,n(),l(new Error(`CWA ${t} script load fail`)))},document.head.appendChild(s),setTimeout(()=>{u||(u=!0,n(),l(new Error(`CWA ${t}: timeout 15s`)))},15e3)});return j={mid:t,promise:a},a}function Mt(t){const e=t.name?.C||t.name?.E||"CWA 浮標",a=t.name?.E||"Buoy",r=t.Time_Interval?.[0]||"",l=c=>{if(c==null||c==="-")return null;const $=parseFloat(c);return isNaN($)?null:$},s=t.waveHeight||[],u=t.wavePeriod||[],n=t.windSpeed?.MS||[],o=t.seaTemperature?.C||[],f=t.stationPressure||[],g=(t.windSpeed2?.MS||[]).map(c=>{if(c==null)return null;const $=c.marker?.symbol?.match(/wind_icon\/([A-Z]+)\.gif/);return $?bt($[1]):null}),v=[];for(let c=0;c<(t.time?.length??0);c++){const $=t.time[c];v.push({t:new Date($).toISOString(),date:new Date($),hour:new Date($).getHours(),source:"cwa",waveM:l(s[c]),wavePer:l(u[c]),windMs:l(n[c]),windDeg:g[c],tempC:l(o[c]),sstC:l(o[c]),pressure:l(f[c])})}return{siteName:e,station:a,updTxt:r,samples:v}}function bt(t){return{N:0,NNE:22.5,NE:45,ENE:67.5,E:90,ESE:112.5,SE:135,SSE:157.5,S:180,SSW:202.5,SW:225,WSW:247.5,W:270,WNW:292.5,NW:315,NNW:337.5}[t]??null}function xt(t,e){const a=n=>{const o=n.date;return`${o.getFullYear()}-${o.getMonth()+1}-${o.getDate()} ${String(o.getHours()).padStart(2,"0")}`},r=new Map;e.forEach(n=>r.set(a(n),n));const l=[];for(const n of t){const o=r.get(a(n));if(!o)continue;const f=n.waveM!=null&&o.waveM!=null?{obs:n.waveM,fcst:o.waveM,diff:n.waveM-o.waveM,pct:(n.waveM-o.waveM)/o.waveM*100}:null,g=n.windMs!=null&&o.windMs!=null?{obs:n.windMs,fcst:o.windMs,diff:n.windMs-o.windMs,pct:(n.windMs-o.windMs)/o.windMs*100}:null,v=n.tempC!=null&&o.sstC!=null?{obs:n.tempC,fcst:o.sstC,diff:n.tempC-o.sstC,pct:(n.tempC-o.sstC)/o.sstC*100}:null,c=$=>{if($==null)return"na";const d=Math.abs($);return d<=15?"go":d<=30?"caution":"nogo"};l.push({date:n.date,waveDelta:f,windDelta:g,tempDelta:v,waveCls:c(f?.pct),windCls:c(g?.pct),tempCls:c(v?.pct)})}let s="go";const u={go:0,caution:1,nogo:2};for(const n of l)for(const o of[n.waveCls,n.windCls,n.tempCls])u[o]>u[s]&&(s=o);return{pairs:l,verdict:s}}function Dt(t){if(!t.length)return"";const e=700,a=130,r=38,l=12,s=8,u=22,n=e-r-l,f=(a-s-u)/3,g=[{name:"wave",max:2,unit:"m",desc:"浪高"},{name:"wind",max:12,unit:"m/s",desc:"風速"},{name:"temp",min:18,max:32,unit:"°C",desc:"水溫"}];function v(m,M){const h=g.find(k=>k.name===m),i=g.indexOf(h),p=s+i*f+f,b=f-4;if(M==null)return null;if(m==="temp"){const k=(Math.max(h.min,Math.min(h.max,M))-h.min)/(h.max-h.min);return p-k*b-2}const x=Math.max(0,Math.min(h.max,M))/h.max;return p-x*b-2}const c=t.slice(-6),$=m=>r+m/Math.max(1,c.length-1)*n,d=[{field:"waveDelta",yName:"wave",obs:"#58d7ff",label:"浪高"},{field:"windDelta",yName:"wind",obs:"#d29922",label:"風速"},{field:"tempDelta",yName:"temp",obs:"#3fb950",label:"水溫"}],D=[1,2].map(m=>{const M=s+m*f;return`<line x1="${r}" y1="${M.toFixed(1)}" x2="${e-l}" y2="${M.toFixed(1)}" stroke="rgba(120,180,255,0.18)" stroke-dasharray="3 3"/>`}).join(""),F=d.flatMap(m=>{const M=c.map((i,y)=>i[m.field]?.obs).map((i,y)=>i!=null?`${y===0?"M":"L"} ${$(y).toFixed(1)} ${v(m.yName,i).toFixed(1)}`:"").filter(Boolean).join(" "),h=c.map((i,y)=>i[m.field]?.fcst).map((i,y)=>i!=null?`${y===0?"M":"L"} ${$(y).toFixed(1)} ${v(m.yName,i).toFixed(1)}`:"").filter(Boolean).join(" ");return[M?`<path d="${M}" fill="none" stroke="${m.obs}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`:"",h?`<path d="${h}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.3" stroke-dasharray="3 2"/>`:""]}).join(""),w=c.map((m,M)=>{const h=String(m.date.getHours()).padStart(2,"0");return M%2===0?`<text x="${$(M).toFixed(1)}" y="${a-6}" text-anchor="middle" font-size="10" fill="#8b949e" font-family="JetBrains Mono, monospace">${h}</text>`:""}).join(""),C=g.map((m,M)=>{const h=s+M*f+10,i=m.name==="temp"?`${m.min}–${m.max}${m.unit}`:`${m.max}${m.unit}`;return`<text x="${r-4}" y="${h}" text-anchor="end" font-size="9" fill="#8b949e">${i}</text>`}).join(""),A=d.map((m,M)=>{const h=s+6+M*12;return`<line x1="${e-130}" y1="${h}" x2="${e-110}" y2="${h}" stroke="${m.obs}" stroke-width="1.8"/>
            <text x="${e-106}" y="${h+3}" font-size="9" fill="#cdd9e5" font-family="Inter, sans-serif">${m.label} 觀</text>
            <line x1="${e-70}" y1="${h}" x2="${e-50}" y2="${h}" stroke="rgba(255,255,255,0.4)" stroke-width="1.3" stroke-dasharray="3 2"/>
            <text x="${e-46}" y="${h+3}" font-size="9" fill="#cdd9e5" font-family="Inter, sans-serif">${m.label} 預</text>`}).join("");return`<svg class="cwa-spark" viewBox="0 0 ${e} ${a}" xmlns="http://www.w3.org/2000/svg" aria-label="6h 觀測 vs 預報 sparkline">
        ${D}
        ${F}
        <g class="cwa-spark-legend">${A}</g>
        ${C}
        ${w}
    </svg>`}function kt(t,e,a){const r=document.getElementById("cwa-strip");if(!r)return;if(!t||!e||!e.pairs.length){r.innerHTML=`<div class="cwa-empty">📡 ${a.name} 沒有對應 CWA 浮標觀測 (岸潛浮標只覆蓋龍洞, 龜山島等船潛點改看 Open-Meteo 預報)。</div>`;return}const{siteName:l,station:s,updTxt:u,samples:n}=t,{pairs:o,verdict:f}=e,g=[...n].reverse().find(d=>d.waveM!=null||d.windMs!=null),v=f==="go"?'<span class="cwa-badge go">🟢 預報與實況一致</span>':f==="caution"?'<span class="cwa-badge caution">🟡 預報有偏差</span>':'<span class="cwa-badge nogo">🔴 預報不準, 改參考實況</span>',c=o.slice(-6),$=d=>`${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:00`;r.innerHTML=`
        <div class="cwa-head">
            <div class="cwa-head-l">
                <div class="cwa-station">📡 ${l} · ${a.name}</div>
                <div class="cwa-station-en">${s} (MID ${a.buoyMID})</div>
                <div class="cwa-upd">資料時段: ${u}</div>
            </div>
            <div class="cwa-head-r">
                ${v}
            </div>
        </div>
        <div class="cwa-latest">
            <div class="cwa-cell">
                <div class="cwa-cell-label">最新觀測</div>
                <div class="cwa-cell-val">${g?$(g.date):"—"}</div>
            </div>
            <div class="cwa-cell">
                <div class="cwa-cell-label">浪高</div>
                <div class="cwa-cell-val" style="background:${R(g?.waveM)};color:${_(g?.waveM)}">${g?.waveM?.toFixed(2)??"—"} m</div>
            </div>
            <div class="cwa-cell">
                <div class="cwa-cell-label">浪週期</div>
                <div class="cwa-cell-val" style="background:${ot(g?.wavePer)};color:${_(g?.wavePer)}">${g?.wavePer?.toFixed(1)??"—"} s</div>
            </div>
            <div class="cwa-cell">
                <div class="cwa-cell-label">風速</div>
                <div class="cwa-cell-val" style="background:${P(g?.windMs)};color:${_(g?.windMs)}">${g?.windMs?.toFixed(1)??"—"} m/s</div>
            </div>
            <div class="cwa-cell">
                <div class="cwa-cell-label">水溫</div>
                <div class="cwa-cell-val" style="background:${rt(g?.tempC)};color:${_(g?.tempC)}">${g?.tempC?.toFixed(1)??"—"}°C</div>
            </div>
        </div>
        <div class="cwa-spark-wrap">
            <div class="cwa-spark-title">6h 觀測 vs 預報 曲線對照 · 實線=觀測 · 虛線=Open-Meteo 預報</div>
            ${Dt(o)}
        </div>
        <div class="cwa-cmp">
            <div class="cwa-cmp-head">過去 6 小時 vs Open-Meteo 預報同期對照 · Δ 顏色: 🟢 ≤15% · 🟡 15-30% · 🔴 >30%</div>
            <table class="cwa-cmp-table">
                <thead>
                    <tr>
                        <th class="cwa-cmp-th">時段</th>
                        <th class="cwa-cmp-th">浪高 觀測</th>
                        <th class="cwa-cmp-th">浪高 預報</th>
                        <th class="cwa-cmp-th">Δ</th>
                        <th class="cwa-cmp-th">風速 觀測</th>
                        <th class="cwa-cmp-th">風速 預報</th>
                        <th class="cwa-cmp-th">Δ</th>
                    </tr>
                </thead>
                <tbody>
                    ${c.map(d=>`
                        <tr>
                            <td class="cwa-cmp-time">${$(d.date)}</td>
                            <td class="cwa-cmp-cell" style="background:${R(d.waveDelta?.obs)};color:${_(d.waveDelta?.obs)}">${d.waveDelta?.obs?.toFixed(2)??"—"}</td>
                            <td class="cwa-cmp-cell" style="background:#1a1f2e;color:var(--muted)">${d.waveDelta?.fcst?.toFixed(2)??"—"}</td>
                            <td class="cwa-cmp-delta" style="background:${nt(d.waveCls)};color:${at(d.waveCls)}">${d.waveDelta?`${d.waveDelta.diff>=0?"+":""}${d.waveDelta.diff.toFixed(2)} (${d.waveDelta.pct>=0?"+":""}${d.waveDelta.pct.toFixed(0)}%)`:"—"}</td>
                            <td class="cwa-cmp-cell" style="background:${P(d.windDelta?.obs)};color:${_(d.windDelta?.obs)}">${d.windDelta?.obs?.toFixed(1)??"—"}</td>
                            <td class="cwa-cmp-cell" style="background:#1a1f2e;color:var(--muted)">${d.windDelta?.fcst?.toFixed(1)??"—"}</td>
                            <td class="cwa-cmp-delta" style="background:${nt(d.windCls)};color:${at(d.windCls)}">${d.windDelta?`${d.windDelta.diff>=0?"+":""}${d.windDelta.diff.toFixed(1)} (${d.windDelta.pct>=0?"+":""}${d.windDelta.pct.toFixed(0)}%)`:"—"}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
        <div class="cwa-foot">
            <a href="https://www.cwa.gov.tw/V8/C/M/OBS_Marine_plot.html?MID=${a.buoyMID}" target="_blank" rel="noopener">📊 在 CWA 官網看完整 48hr 時序圖 ↗</a>
            <span>資料: 中央氣象署 ${a.name} 浮標 (MID ${a.buoyMID}) · Open-Meteo Marine ECMWF + GFS</span>
        </div>
    `}function nt(t){return t==="go"?"#1a4d2e":t==="caution"?"#d29922":t==="nogo"?"#f85149":"#1a1f2e"}function at(t){return t==="go"?"#0d1d10":"#fff"}function I(t){const e=t.waveM==null||t.waveM<.6?"go":t.waveM<1.2?"caution":"nogo",a=t.windMs==null||t.windMs<5?"go":t.windMs<8?"caution":"nogo",r=z(t.windDeg),l=r==="offshore"?"nogo":r==="cross-shore"?"caution":"go",s={go:0,caution:1,nogo:2};return[e,a,l].reduce((u,n)=>s[n]>s[u]?n:u,"go")}function At(t){const e=t.filter(n=>n.hour>=6&&n.hour<=12);if(e.length===0)return null;const a={go:0,caution:1,nogo:2},r=e.reduce((n,o)=>{const f=I(o);return a[f]>a[n]?f:n},"go"),l=e.reduce((n,o)=>a[I(o)]<a[I(n)]?o:n,e[0]);let s,u;return r==="go"?(s="🥇 條件達標",u="全部綠燈 — 帶愉快心情下水"):r==="caution"?(s=e.some(o=>z(o.windDeg)==="offshore")?"🥈 換遮蔽點 (潮境/和平島)":"🥈 評估後可下",u="有黃燈 — 看潛點經驗調整"):(s="🔴 改期",u="有紅燈 — 強烈建議不要下水"),{verdict:r,site:s,tip:u,bestHour:l}}function K(t,e){return t.getFullYear()===e.getFullYear()&&t.getMonth()===e.getMonth()&&t.getDate()===e.getDate()}function q(t){return`週${["日","一","二","三","四","五","六"][t.getDay()]} ${t.getMonth()+1}/${t.getDate()}`}function Ct(){const t=new Date,e=t.getDay();let a;e===6?a=new Date(t):e===0?a=new Date(t.getTime()+6*864e5):a=new Date(t.getTime()+(6-e)*864e5),a.setHours(0,0,0,0);const r=new Date(a.getTime()+864e5);return[a,r]}function Ft(t,e){const s=[];for(let w=0;w<24;w++){const C=t.find(M=>M.hour===w),A=C?I(C):null,m={go:0,caution:1,nogo:2};s.push({h:w,s:C,score:A,y:A==null?null:m[A]})}const u=272,n=40,o=w=>4+w/23*u,f=w=>4+w/2*n,v=[{rank:0,color:"rgba(63,185,80,0.10)"},{rank:1,color:"rgba(210,153,34,0.10)"},{rank:2,color:"rgba(248,81,73,0.10)"}].map((w,C)=>{const A=4+w.rank/2*n,m=4+(w.rank+1)/2*n;return`<rect x="4" y="${A}" width="${u}" height="${m-A}" fill="${w.color}"/>`}).join(""),c=[];for(let w=0;w<s.length;w++)s[w].y!=null&&c.push(`${w===0||s[w-1].y==null?"M":"L"} ${o(w).toFixed(1)} ${f(s[w].y).toFixed(1)}`);const $=c.join(" "),d=s.filter(w=>w.y!=null).map(w=>{const C=w.score==="go"?"#3fb950":w.score==="caution"?"#d29922":"#f85149";return`<circle cx="${o(w.h).toFixed(1)}" cy="${f(w.y).toFixed(1)}" r="1.8" fill="${C}"/>`}).join(""),D=e?.hour??null,F=D!=null?`<line x1="${o(D).toFixed(1)}" y1="3" x2="${o(D).toFixed(1)}" y2="45" stroke="#58d7ff" stroke-width="1" stroke-dasharray="2 2" opacity="0.85"/>
           <text x="${o(D).toFixed(1)}" y="3" text-anchor="middle" font-size="8" fill="#58d7ff" font-weight="700">最佳</text>`:"";return`<svg class="ww-spark" viewBox="0 0 280 48" xmlns="http://www.w3.org/2000/svg" aria-label="24h verdict sparkline">
        ${v}
        <line x1="4" y1="${4+n/2}" x2="276" y2="${4+n/2}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2 2"/>
        ${$?`<path d="${$}" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/>`:""}
        ${d}
        ${F}
    </svg>`}function St(t){const e=document.getElementById("weekend-rec");if(!e)return;const[a,r]=Ct(),l=t.filter(n=>K(n.date,a)),s=t.filter(n=>K(n.date,r));if(l.length===0&&s.length===0){e.innerHTML='<div class="ww-empty">目前 Open-Meteo 預報只到 10 日內，下一個週末超出預報範圍。</div>';return}const u=[{date:a,samples:l,label:"週六"},{date:r,samples:s,label:"週日"}];e.innerHTML=u.map(({date:n,samples:o,label:f})=>{const g=At(o);if(!g)return`<div class="ww-day-card ww-empty-card">
                <div class="ww-day-name">${q(n)}</div>
                <div class="ww-day-empty">目前無資料</div>
            </div>`;const v=`ww-${g.verdict}`,c={go:"🟢 GO",caution:"🟡 CAUTION",nogo:"🔴 NO-GO"}[g.verdict],$=o.reduce((p,b)=>b.windMs>(p?.windMs??-1)?b:p,o[0]),d=o.reduce((p,b)=>b.waveM>(p?.waveM??-1)?b:p,o[0]),D=z($.windDeg),F={onshore:"✅","cross-shore":"⚠️",offshore:"❌",unknown:"·"}[D],w=o[0]||$,C=o.find(p=>p.hour===Math.min(23,(w.hour||6)+6))||$,A=(C.windMs??0)-(w.windMs??0),m=(C.waveM??0)-(w.waveM??0),M=p=>p>.3?"↗":p<-.3?"↘":"→",h=p=>p>.3?"#f85149":p<-.3?"#3fb950":"#8b949e",i=(p,b,x)=>{const k=w?p/(w[`${x}Ms`]||w[`${x}M`]||1)*100:0;return`${p>0?"+":""}${p.toFixed(1)}${b} (${k>0?"+":""}${k.toFixed(0)}%)`},y=String(g.bestHour.hour).padStart(2,"0")+":00";return`
        <div class="ww-day-card ${v}">
            <div class="ww-day-head">
                <div class="ww-day-name">${q(n)}</div>
                <div class="ww-day-badge ${g.verdict}">${c}</div>
            </div>
            <div class="ww-day-site">${g.site}</div>
            <div class="ww-day-tip">${g.tip}</div>
            ${Ft(o,g.bestHour)}
            <div class="ww-day-stats">
                <div class="ww-stat">
                    <span class="ww-stat-label">建議時段</span>
                    <span class="ww-stat-val">${y}</span>
                </div>
                <div class="ww-stat">
                    <span class="ww-stat-label">最大風速</span>
                    <span class="ww-stat-val" style="background:${P($.windMs)};color:${_($.windMs)}">${$.windMs?.toFixed(1)??"—"} m/s</span>
                </div>
                <div class="ww-stat">
                    <span class="ww-stat-label">最大浪高</span>
                    <span class="ww-stat-val" style="background:${R(d.waveM)};color:${_(d.waveM)}">${d.waveM?.toFixed(2)??"—"} m</span>
                </div>
                <div class="ww-stat">
                    <span class="ww-stat-label">風向</span>
                    <span class="ww-stat-val">${F} ${lt(D)} ${J($.windDeg)} ${Math.round($.windDeg??0)}°</span>
                </div>
            </div>
            <div class="ww-day-trend">
                <span class="ww-trend-item">
                    <span class="ww-trend-label">風 6h 趨勢</span>
                    <span class="ww-trend-val" style="color:${h(A)}">${M(A)} ${i(A,"m/s","wind")}</span>
                </span>
                <span class="ww-trend-item">
                    <span class="ww-trend-label">浪 6h 趨勢</span>
                    <span class="ww-trend-val" style="color:${h(m)}">${M(m)} ${i(m,"m","wave")}</span>
                </span>
            </div>
        </div>`}).join("")}const _t=["北","北東北","東北","東東北","東","東東南","東南","南東南","南","南西南","西南","西西南","西","西西北","西北","北西北"];function Et(t){return t==null?"?":_t[Math.round(t%360/22.5)%16]}function Wt(t){const e=document.getElementById("windrose-petals"),a=document.getElementById("windrose-rings"),r=document.getElementById("windrose-labels");if(!e||!a||!r)return;const l=new Array(8).fill(0);let s=0;for(const v of t){if(v.windDeg==null)continue;const c=Math.round(v.windDeg%360/45)%8;l[c]++,l[c]>s&&(s=l[c])}const u=50,n=["N","NE","E","SE","S","SW","W","NW"],o=["rgba(210,153,34,0.55)","rgba(63,185,80,0.45)","rgba(63,185,80,0.65)","rgba(210,153,34,0.55)","rgba(210,153,34,0.55)","rgba(248,81,73,0.45)","rgba(248,81,73,0.65)","rgba(248,81,73,0.45)"],f=["#d29922","#3fb950","#3fb950","#d29922","#d29922","#f85149","#f85149","#f85149"];a.innerHTML=[.25,.5,.75].map(v=>`<circle cx="0" cy="0" r="${u*v}" fill="none" stroke="rgba(120,180,255,0.18)" stroke-width="0.5" stroke-dasharray="1 2"/>`).join(""),e.innerHTML=l.map((v,c)=>{if(v===0)return"";const $=c*45,d=($-22.5)*Math.PI/180,D=($+22.5)*Math.PI/180,F=Math.max(4,v/Math.max(1,s)*u),w=5,C=F*Math.sin(d),A=-F*Math.cos(d),m=F*Math.sin(D),M=-F*Math.cos(D),h=w*Math.sin(d),i=-w*Math.cos(d),y=w*Math.sin(D),p=-w*Math.cos(D),b=0;return`<path class="windrose-petal" d="${`M ${C.toFixed(1)} ${A.toFixed(1)} A ${F.toFixed(1)} ${F.toFixed(1)} 0 ${b} 1 ${m.toFixed(1)} ${M.toFixed(1)} L ${y.toFixed(1)} ${p.toFixed(1)} A ${w.toFixed(1)} ${w.toFixed(1)} 0 ${b} 0 ${h.toFixed(1)} ${i.toFixed(1)} Z`}" fill="${o[c]}" stroke="${f[c]}" stroke-width="0.8" stroke-linejoin="round"><title>${n[c]} · ${v} 小時</title></path>`}).join("");const g=u+10;r.innerHTML=n.map((v,c)=>{const $=c*45*Math.PI/180,d=g*Math.sin($),D=-g*Math.cos($);return`<text x="${d.toFixed(1)}" y="${(D+2.5).toFixed(1)}" text-anchor="middle" font-size="7" fill="#8b949e" font-family="'JetBrains Mono', monospace">${v}</text>`}).join("")}function Tt(t){const e=document.getElementById("compass-live"),a=document.getElementById("compass-live-arrow"),r=document.getElementById("compass-live-label");if(!e||!a||!r)return;const l=Date.now();let s=null,u=1/0;for(const v of t){if(v.windDeg==null||v.windMs==null)continue;const c=Math.abs(v.date.getTime()-l);c<u&&(u=c,s=v)}if(!s)return;const n=s.windDeg,o=s.windMs;e.setAttribute("data-wind-deg",n.toFixed(0)),e.setAttribute("data-wind-ms",o.toFixed(1)),e.setAttribute("data-loaded","true"),a.setAttribute("transform",`rotate(${n.toFixed(1)})`),r.setAttribute("transform",`rotate(${n.toFixed(1)})`);const f=r.querySelector("text");f&&(f.textContent=`${o.toFixed(1)} m/s`);const g=document.getElementById("compass-current");if(g){const v=g.querySelector(".compass-current-val"),c=g.querySelector(".compass-current-dir");v&&(v.textContent=`${o.toFixed(1)} m/s`),c&&(c.textContent=`${Et(n)} ${Math.round(n)}°`)}}function It(t,e={}){const a=document.getElementById("forecast-grid");if(!a)return;const r=e.hourStart??6,l=e.hourEnd??18,s=e.days??7,u=new Date;u.setHours(0,0,0,0);const n=new Date(u);new Date(u.getTime()+(s-1)*864e5);const o=[];for(let i=0;i<s;i++){const y=new Date(n.getTime()+i*864e5),p=t.filter(b=>K(b.date,y)&&b.hour>=r&&b.hour<=l);o.push({date:y,samples:p})}const f=[];for(let i=r;i<=l;i++)f.push(i);const g=`<tr class="fg-dayhead">
        <th class="fg-label fg-sticky">指標</th>
        ${o.map(i=>`<th class="fg-day ${i.date.getDay()===0||i.date.getDay()===6?"fg-weekend":""}" colspan="${f.length}">${q(i.date)}</th>`).join("")}
    </tr>`,v=`<tr class="fg-hourhead">
        <th class="fg-label fg-sticky"></th>
        ${o.flatMap(i=>f.map(y=>`<th class="fg-hour ${i.date.getDay()===0||i.date.getDay()===6?"fg-weekend":""}">${y}</th>`)).join("")}
    </tr>`,c=15,$=25,d=2.5,D=14,F=32,w=5;function C(i,y){return i==null||isNaN(i)?0:Math.max(0,Math.min(1,Math.abs(i)/y))}function A(i,y,p,b,x=1){if(!i||p(i)==null)return'<td class="fg-cell fg-na">—</td>';const k=p(i),W=y(k),L=i.windDeg!=null?J(i.windDeg):"·",H=z(i.windDeg),S=`風 ${i.windMs?.toFixed(1)??"?"} m/s ${L} ${Math.round(i.windDeg??0)}° (${lt(H)}) · 陣風 ${i.gustMs?.toFixed(1)??"?"} · 浪 ${i.waveM?.toFixed(2)??"?"} m @ ${i.wavePer?.toFixed(0)??"?"}s · 水溫 ${i.tempC?.toFixed(0)??"?"}°C`,E=C(k,x),O=b!=null?k.toFixed(b):k;return`<td class="fg-cell" style="background:${W};color:${_(k)}" title="${S}">
            <div class="fg-cell-num">${O}</div>
            <div class="fg-cell-bar" style="width:${(E*100).toFixed(0)}%"></div>
        </td>`}function m(i,y,p,b,x){return`<tr class="fg-row">
            <td class="fg-label fg-sticky">${i}</td>
            ${o.flatMap(k=>f.map(W=>{const L=k.samples.find(H=>H.hour===W);return A(L,y,p,b,x)})).join("")}
        </tr>`}function M(){const i={go:0,caution:1,nogo:2},y=o.findIndex(x=>x.date.getDay()===6),p=o.findIndex(x=>x.date.getDay()===0);return`<tr class="fg-row fg-row-summary">
            <td class="fg-label fg-sticky">最佳時段</td>
            ${o.flatMap((x,k)=>{if(!x.samples.length)return f.map(()=>'<td class="fg-cell fg-na" colspan="1">—</td>').slice(0,f.length);const W=f.map(S=>{const E=x.samples.find(O=>O.hour===S);return E?i[I(E)]:null}),L=Math.min(...W.filter(S=>S!=null)),H=f[W.findIndex(S=>S===L)];return f.map(S=>{const E=x.samples.find(vt=>vt.hour===S);if(!E)return'<td class="fg-cell fg-na">—</td>';const N=I(E),ut=N==="go"?"#1a4d2e":N==="caution"?"#d29922":"#f85149",wt=N==="go"?"#0d1d10":"#fff",G=S===H,ft=G?`✓ ${String(S).padStart(2,"0")}:00`:"·",tt=`${q(x.date)} ${String(S).padStart(2,"0")}:00 — ${N==="go"?"GO":N==="caution"?"CAUTION":"NO-GO"}`,U=G&&(k===y||k===p),mt=`fg-cell fg-best-cell ${G?"fg-best-cell-mark":""} ${U?"fg-best-cell-clickable":""}`,gt=U?`data-wday="${x.date.getDay()}" data-day-idx="${k}"`:"",$t=U?`${tt} · 點擊跳到週末卡`:tt;return`<td class="${mt}" style="background:${ut};color:${wt}" title="${$t}" ${gt}>${ft}</td>`})}).join("")}
        </tr>`}const h=`
        ${M()}
        ${m("風速 (m/s)",P,i=>i.windMs,1,c)}
        ${m("陣風 (m/s)",P,i=>i.gustMs,1,$)}
        ${m("風向 (°)",()=>"#252b3b",i=>i.windDeg!=null?`${J(i.windDeg)} ${Math.round(i.windDeg)}`:null,null,1)}
        ${m("浪高 (m)",R,i=>i.waveM,2,d)}
        ${m("週期 (s)",ot,i=>i.wavePer,0,D)}
        ${m("溫度 (°C)",rt,i=>i.tempC,0,F)}
        ${m("降雨 (mm)",i=>i==null?"#3a3f4b":i.precip>2?"#f85149":i.precip>.1?"#d29922":"#1a4d2e",i=>i.precip,1,w)}
    `;a.innerHTML=`
        <div class="fg-scroll">
            <table class="fg-table">
                <thead>${g}${v}</thead>
                <tbody>${h}</tbody>
            </table>
        </div>
        <div class="fg-foot">
            <span>資料: Open-Meteo (Marine ECMWF + WAVEWATCH III / Weather GFS)</span>
            <span>座標: ${X().lat}°N, ${X().lon}°E · ${X().name}</span>
        </div>
    `}let B="longdong",T=[],st=null,V=!1;function X(){return Q(B)}function ct(t){document.querySelectorAll(".site-tab").forEach(e=>{const a=e.getAttribute("data-site-id")===t;e.classList.toggle("is-active",a),e.setAttribute("aria-selected",a?"true":"false")}),document.querySelectorAll(".site-card").forEach(e=>{const a=e.getAttribute("data-site-id")===t;e.classList.toggle("is-current",a)})}async function dt(t){if(V)return;V=!0,B=t;const e=Q(t);ct(t);const a=document.getElementById("weekend-rec"),r=document.getElementById("forecast-grid"),l=document.getElementById("cwa-strip");a&&(a.innerHTML='<div class="ww-loader">載入 Open-Meteo 預報中…</div>'),r&&(r.innerHTML='<div class="fg-loader">載入中…</div>');try{if(T=await ht(e),St(T),It(T),Tt(T),Wt(T),e.buoyMID)try{st=await yt(e.buoyMID);const s=Mt(st),u=xt(s.samples,T);kt(s,u,e)}catch(s){console.warn(`CWA ${e.buoyMID} load fail (non-fatal):`,s.message),l&&(l.innerHTML=`<div class="cwa-error">📡 CWA 浮標 (${e.buoyMID}) 暫時連不上 (預報仍可用, 觀測對照跳過)</div>`)}else l&&(l.innerHTML=`<div class="cwa-info">ℹ️ ${e.name} 沒有對應 CWA 浮標 — 岸潛浮標只覆蓋龍洞, 預報仍可用。</div>`);r.querySelectorAll(".fg-row").forEach(s=>{s.addEventListener("click",u=>{s.classList.toggle("fg-row-open")})}),r.querySelectorAll(".fg-best-cell-clickable").forEach(s=>{s.addEventListener("click",u=>{u.stopPropagation();const o=s.getAttribute("data-wday")==="0"?1:0,f=document.querySelectorAll(".ww-day-card")[o];f&&(f.scrollIntoView({behavior:"smooth",block:"center"}),f.classList.add("ww-day-card-flash"),setTimeout(()=>f.classList.remove("ww-day-card-flash"),1500))})})}catch(s){console.error("forecast load fail:",s),a&&(a.innerHTML='<div class="ww-error">⚠️ 預報載入失敗 — Open-Meteo 暫時不可用, 回到 <a href="https://www.windguru.cz/464009" target="_blank">Windguru</a> 手動查看。</div>'),r&&(r.innerHTML='<div class="fg-error">⚠️ 預報載入失敗, 請稍後重試。</div>')}finally{V=!1}}function Lt(){document.querySelectorAll(".site-tab").forEach(t=>{t.addEventListener("click",()=>{const e=t.getAttribute("data-site-id");!e||e===B||(history.replaceState(null,"",`#${e}`),ct(e),dt(e))})})}function Ht(){const t=window.location.hash.replace("#","");t&&Q(t)&&(B=t)}async function Nt(){if(!Z.length){console.error("diving-forecast: 找不到任何 site-tab, 頁面結構可能不對");return}Ht(),Lt(),await dt(B)}document.addEventListener("DOMContentLoaded",Nt);const it="Asia%2FTaipei";function Pt(){const t=document.querySelectorAll(".site-tab");return Array.from(t).map(e=>({id:e.getAttribute("data-site-id"),name:e.getAttribute("data-site-name"),lat:parseFloat(e.getAttribute("data-site-lat")),lon:parseFloat(e.getAttribute("data-site-lon")),buoyMID:e.getAttribute("data-site-buoy")||null})).filter(e=>e.id&&!isNaN(e.lat)&&!isNaN(e.lon))}function Bt(t){return t==null?"#3a3f4b":t<2.5?"#1a4d2e":t<5?"#3fb950":t<8?"#d29922":t<11?"#db6d28":"#f85149"}function Ot(t){return t==null?"#3a3f4b":t<.6?"#1a4d2e":t<1?"#3fb950":t<1.4?"#d29922":t<1.8?"#db6d28":"#f85149"}function jt(t){return t==null?"#3a3f4b":t<20?"#f85149":t<24?"#58a6c4":t<=28?"#3fb950":t<=30?"#d29922":"#db6d28"}function Rt(t){return t==null?"·":["↑","↗","→","↘","↓","↙","←","↖"][Math.round(t%360/45)%8]}const qt=["北","東北","東","東南","南","西南","西","西北"];function zt(t){return t==null?"?":qt[Math.round(t%360/45)%8]}function Gt(t,e){return t==null?"unknown":e==="longdong"?t>=60&&t<=130?"onshore":t>=240&&t<=300?"offshore":"cross-shore":t>=50&&t<=140?"onshore":t>=230&&t<=310?"offshore":"cross-shore"}function Y(t){return t==null?"#aaa":t<5?"#0d1d10":"#fff"}function Ut(t){return t==="go"?'<span class="mini-verdict go">🟢 GO</span>':t==="caution"?'<span class="mini-verdict caution">🟡 小心</span>':t==="nogo"?'<span class="mini-verdict nogo">🔴 NO-GO</span>':'<span class="mini-verdict unknown">—</span>'}async function Vt(t){const e=`https://api.open-meteo.com/v1/forecast?latitude=${t.lat}&longitude=${t.lon}&current_weather=true&windspeed_unit=ms&timezone=${it}`,a=`https://marine-api.open-meteo.com/v1/marine?latitude=${t.lat}&longitude=${t.lon}&current=wave_height,wave_period,sea_surface_temperature&timezone=${it}`,[r,l]=await Promise.all([fetch(e).then(n=>n.json()),fetch(a).then(n=>n.json()).catch(()=>({}))]),s=r.current_weather,u=l.current||{};return{windMs:s?.windspeed??null,windDeg:s?.winddirection??null,tempC:s?.temperature??null,waveM:u.wave_height??null,wavePer:u.wave_period??null,sstC:u.sea_surface_temperature??null,ts:s?.time||null}}function Xt(t){if(t.windMs==null&&t.waveM==null)return"unknown";let e="go";const a={go:0,caution:1,nogo:2},r=l=>{a[l]>a[e]&&(e=l)};return t.waveM!=null&&(t.waveM<.6?r("go"):t.waveM<1.2?r("caution"):r("nogo")),t.windMs!=null&&(t.windMs<5?r("go"):t.windMs<8?r("caution"):r("nogo")),e}function Yt(t,e){const a=document.querySelector(`[data-site-mini-id="${t.id}"]`);if(!a)return;const r=Xt(e),l=Gt(e.windDeg,t.id),s={onshore:"✅","cross-shore":"⚠️",offshore:"❌",unknown:"·"}[l];a.innerHTML=`
        <div class="site-mini-head">
            <span class="site-mini-label">當下海況</span>
            ${Ut(r)}
        </div>
        <div class="site-mini-grid">
            <div class="mini-cell" style="background:${Bt(e.windMs)};color:${Y(e.windMs)}">
                <div class="mini-cell-label">風速</div>
                <div class="mini-cell-val">${e.windMs!=null?e.windMs.toFixed(1):"—"}<span class="mini-cell-unit">m/s</span></div>
            </div>
            <div class="mini-cell" style="background:${Ot(e.waveM)};color:${Y(e.waveM)}">
                <div class="mini-cell-label">浪高</div>
                <div class="mini-cell-val">${e.waveM!=null?e.waveM.toFixed(2):"—"}<span class="mini-cell-unit">m</span></div>
            </div>
            <div class="mini-cell" style="background:${jt(e.sstC??e.tempC)};color:${Y(e.sstC??e.tempC)}">
                <div class="mini-cell-label">水溫</div>
                <div class="mini-cell-val">${(e.sstC??e.tempC)!=null?(e.sstC??e.tempC).toFixed(0):"—"}<span class="mini-cell-unit">°C</span></div>
            </div>
            <div class="mini-cell mini-cell-dir" title="${s} ${l}">
                <div class="mini-cell-label">風向</div>
                <div class="mini-cell-val">
                    <span class="mini-arrow">${Rt(e.windDeg)}</span>
                    <span class="mini-dir-name">${zt(e.windDeg)}</span>
                    <span class="mini-dir-deg">${e.windDeg!=null?Math.round(e.windDeg):"—"}°</span>
                </div>
            </div>
        </div>
        <div class="site-mini-foot">
            <span class="mini-foot-item">${s} ${{onshore:"迎岸",offshore:"離岸","cross-shore":"沿岸",unknown:"?"}[l]}</span>
            <span class="mini-foot-ts">${e.ts?new Date(e.ts).toLocaleString("zh-TW",{hour:"2-digit",minute:"2-digit",month:"2-digit",day:"2-digit"}):""}</span>
        </div>
    `,a.classList.remove("site-mini-loading")}function Zt(t,e){const a=document.querySelector(`[data-site-mini-id="${t.id}"]`);a&&(a.innerHTML=`
        <div class="site-mini-head">
            <span class="site-mini-label">當下海況</span>
            <span class="mini-verdict unknown">連不上</span>
        </div>
        <div class="site-mini-error">⚠️ Open-Meteo 暫時取不到資料 (${e.slice(0,60)})</div>
    `,a.classList.add("site-mini-error-wrap"))}async function Jt(){const t=Pt();t.length&&await Promise.all(t.map(async e=>{try{const a=await Vt(e);Yt(e,a)}catch(a){console.warn(`[sites-conditions] ${e.id} fetch fail:`,a.message),Zt(e,a.message||"unknown")}}))}document.addEventListener("DOMContentLoaded",Jt);
