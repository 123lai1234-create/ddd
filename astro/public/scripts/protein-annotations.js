(async function(){
const $=id=>document.getElementById(id), status=$('annotation-status'), id=(new URLSearchParams(location.search).get('pdb')||'4HHB').trim().toUpperCase();
$('annotation-pdb').value=id;
if(!/^[1-9][A-Z0-9]{3}$/.test(id)){status.textContent='請輸入有效 PDB ID';return;}
$('annotation-source').href='https://www.rcsb.org/3d-sequence/'+id;
$('download').href='https://files.rcsb.org/download/'+id+'.pdb';
$('fasta').href='https://www.rcsb.org/fasta/entry/'+id+'/display';
status.textContent='載入結構中…';
const aa={ALA:'A',ARG:'R',ASN:'N',ASP:'D',CYS:'C',GLU:'E',GLN:'Q',GLY:'G',HIS:'H',ILE:'I',LEU:'L',LYS:'K',MET:'M',PHE:'F',PRO:'P',SER:'S',THR:'T',TRP:'W',TYR:'Y',VAL:'V',MSE:'M'};
async function get(url,type='json'){const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);return type==='json'?r.json():r.text();}
try{
if(!window.$3Dmol)throw Error('3D 引擎載入失敗');
const pdb=await get($('download').href,'text');
const viewer=$3Dmol.createViewer($('annotation-viewer'),{backgroundColor:'white'});
const model=viewer.addModel(pdb,'pdb');
const chains=new Map(), key=a=>String(a.resi)+(a.icode||'');
for(const a of model.selectedAtoms({})){if(!aa[a.resn])continue;const c=a.chain||'';if(!chains.has(c))chains.set(c,new Map());const m=chains.get(c);if(!m.has(key(a)))m.set(key(a),a);}
if(!chains.size)throw Error('找不到可顯示的蛋白質殘基');
let current=null;
function paint(){const style=$('style').value;viewer.setStyle({}, {[style]:{colorscheme:'chain'}});viewer.setStyle({hetflag:true},{stick:{colorscheme:'Jmol'}});if(current) viewer.setStyle({chain:current.chain,resi:current.resi,icode:current.icode||''},{stick:{color:'gold'},sphere:{scale:0.3,color:'gold'}});viewer.render();}
function select(a){current=a;$('chain').value=a.chain||'';draw();paint();viewer.zoomTo({chain:a.chain,resi:a.resi,icode:a.icode||''},500);viewer.render();$('selected').textContent='Chain '+a.chain+' · '+a.resn+' '+key(a);}
function draw(){const el=$('sequence');el.replaceChildren();for(const a of chains.get($('chain').value)?.values()||[]){const b=document.createElement('button');b.type='button';b.textContent=aa[a.resn];b.className=a.ss==='h'?'helix':a.ss==='s'?'sheet':'';b.title=a.resn+' '+key(a);b.setAttribute('aria-pressed',String(!!current&&current.chain===a.chain&&key(current)===key(a)));const n=document.createElement('small');n.textContent=key(a);b.append(n);b.onclick=()=>select(a);el.append(b);}}
for(const c of chains.keys()){$('chain').add(new Option('Chain '+(c||'(blank)'),c));}
$('chain').onchange=()=>{current=null;draw();paint();viewer.zoomTo({chain:$('chain').value});viewer.render();};
$('style').onchange=paint;$('reset').onclick=()=>{current=null;draw();paint();viewer.zoomTo();viewer.render();};
viewer.setClickable({},true,a=>{if(aa[a.resn])select(a);else $('selected').textContent='配體 '+a.resn+' · Chain '+a.chain+' · '+key(a);});
draw();paint();viewer.zoomTo();viewer.render();window.addEventListener('resize',()=>{viewer.resize();viewer.render();});
status.textContent=id+' · 已載入 '+chains.size+' 條蛋白質鏈（僅顯示具有座標的殘基）';
$('details').textContent=id;
try{const data=await get('https://data.rcsb.org/rest/v1/core/entry/'+id);const lines=[data.struct?.title,data.exptl?.map(x=>x.method).join(', '),data.rcsb_entry_info?.resolution_combined?.map(x=>x+' Å').join(', ')].filter(Boolean);for(const line of lines){const p=document.createElement('p');p.textContent=line;$('details').append(p);}const entities=data.rcsb_entry_container_identifiers?.polymer_entity_ids||[];for(const e of entities){try{const d=await get('https://data.rcsb.org/rest/v1/core/polymer_entity/'+id+'/'+e);for(const ref of d.rcsb_polymer_entity_container_identifiers?.reference_sequence_identifiers||[]){if(ref.database_name!=='UniProt')continue;const p=document.createElement('p'),a=document.createElement('a');a.href='https://www.uniprot.org/uniprotkb/'+encodeURIComponent(ref.database_accession)+'/entry';a.target='_blank';a.rel='noopener';a.textContent='UniProt '+ref.database_accession;p.append(a);$('details').append(p);}}catch{}}}catch{const p=document.createElement('p');p.textContent='結構資訊暫時無法取得';$('details').append(p);}
}catch(e){status.textContent='載入失敗：'+e.message+'。請使用 RCSB 原始資料連結。';}
})();