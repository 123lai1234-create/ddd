"""
UniProt ingest: 拉特定蛋白質 entry 進 RAG
用法: python scripts/uniprot-ingest.py [--accession P01308,P42212 ...]

預設拉 5 個經典蛋白質 (insulin, GFP, lysozyme, hemoglobin, myoglobin) 作為示範。
"""
import argparse
import datetime as _dt
import json
import os
import sys
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
RAG_DIR = ROOT / '.rag'
INDEX_PATH = RAG_DIR / 'index.json'
OLLAMA_URL = os.getenv('OLLAMA_URL', 'http://localhost:11434')
EMBED_MODEL = os.getenv('OLLAMA_EMBED_MODEL', 'nomic-embed-text')

# 預設 5 個 entry
DEFAULT_ACCESSIONS = [
    ('P01308', 'INS_HUMAN', 'Insulin (人類胰島素)'),
    ('P42212', 'GFP_AEQVI', 'Green fluorescent protein (GFP)'),
    ('P61626', 'LYSC_HUMAN', 'Lysozyme C (溶菌酶)'),
    ('P69905', 'HBA_HUMAN', 'Hemoglobin subunit alpha (血紅素 α)'),
    ('P02144', 'MYO_HUMAN', 'Myoglobin (肌紅素)'),
]


def fetch_uniprot(acc: str) -> dict | None:
    """Fetch UniProt entry in JSON via REST API."""
    url = f'https://rest.uniprot.org/uniprotkb/{acc}?format=json&fields=id,accession,protein_name,gene_names,organism_name,sequence,cc_function,cc_subcellular_location,cc_disease,xref_pdb'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'donttalk-rag/1.0'})
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f'  [skip] {acc}: {e}', file=sys.stderr)
        return None


def extract_text(entry: dict) -> tuple[str, str, str]:
    """Extract (acc, name, descriptive_text) from UniProt entry."""
    acc = entry.get('primaryAccession', 'unknown')
    # protein name
    name = ''
    desc = entry.get('proteinDescription', {})
    rec = desc.get('recommendedName', {})
    if rec:
        name = rec.get('fullName', {}).get('value', '')
    elif desc.get('submissionNames'):
        name = desc['submissionNames'][0].get('fullName', {}).get('value', '')

    organism = entry.get('organism', {}).get('scientificName', '')
    gene = ', '.join(entry.get('genes', [{}])[0].get('geneName', {}).get('value', '').split())
    sequence = entry.get('sequence', {}).get('value', '')
    seq_len = entry.get('sequence', {}).get('length', 0)

    parts = []
    if name:
        parts.append(f'蛋白質名稱：{name}')
    if gene:
        parts.append(f'基因：{gene}')
    if organism:
        parts.append(f'物種：{organism}')
    parts.append(f'UniProt accession：{acc}')
    parts.append(f'序列長度：{seq_len} 個胺基酸')

    # Function comments
    for c in entry.get('comments', []):
        ctype = c.get('commentType', '')
        if ctype == 'FUNCTION':
            for txt in c.get('texts', []):
                parts.append(f'功能：{txt.get("value", "")}')
        elif ctype == 'SUBCELLULAR LOCATION':
            for loc in c.get('subcellularLocations', []):
                parts.append(f'位置：{loc.get("location", {}).get("value", "")}')

    # PDB xrefs
    pdbs = []
    for x in entry.get('uniProtKBCrossReferences', []):
        if x.get('database') == 'PDB':
            pdbs.append(x.get('id'))
    if pdbs:
        parts.append(f'PDB 結構：{", ".join(pdbs[:5])}')

    # Sequence (truncated to first 200 chars for the descriptive chunk)
    if sequence:
        snippet = sequence[:200] + ('…' if len(sequence) > 200 else '')
        parts.append(f'序列開頭：{snippet}')

    return acc, name or acc, '\n'.join(parts)


def embed(text: str) -> list[float]:
    body = json.dumps({'model': EMBED_MODEL, 'prompt': text}).encode('utf-8')
    req = urllib.request.Request(
        f'{OLLAMA_URL}/api/embeddings',
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())['embedding']


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--accession', help='comma-separated UniProt accessions, e.g. P01308,P42212')
    p.add_argument('--workers', type=int, default=2)
    args = p.parse_args()

    if args.accession:
        pairs = [(a.strip(), '', '') for a in args.accession.split(',')]
    else:
        pairs = DEFAULT_ACCESSIONS

    print(f'[UniProt] fetching {len(pairs)} entries...', flush=True)
    docs: list[dict] = []

    for acc, _, _ in pairs:
        entry = fetch_uniprot(acc)
        if not entry:
            continue
        a, name, text = extract_text(entry)
        docs.append({
            'id': f'uniprot::{a}',
            'source': 'protein',
            'path': f'uniprot/{a}',
            'text': text,
            'meta': {'accession': a, 'name': name, 'chunk_index': 0},
        })
        print(f'  + {a} ({name[:50]})', flush=True)

    if not docs:
        print('[UniProt] no entries fetched', file=sys.stderr)
        sys.exit(1)

    print(f'[UniProt] embedding {len(docs)} entries via {EMBED_MODEL}...', flush=True)
    embeddings: list[list[float] | None] = [None] * len(docs)
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(embed, d['text']): i for i, d in enumerate(docs)}
        for fut in as_completed(futs):
            idx = futs[fut]
            try:
                embeddings[idx] = fut.result()
            except Exception as e:
                print(f'  [embed fail] doc {idx}: {e}', file=sys.stderr)
                embeddings[idx] = []

    final_docs = []
    final_embs = []
    for d, e in zip(docs, embeddings):
        if e:
            final_docs.append(d)
            final_embs.append(e)

    if not final_embs:
        print('[UniProt] all embeddings failed', file=sys.stderr)
        sys.exit(1)

    # Append to existing index.json (or create new)
    if INDEX_PATH.exists():
        try:
            existing = json.load(open(INDEX_PATH, encoding='utf-8'))
            # Drop any prior uniprot docs (re-ingest safe)
            existing['docs'] = [d for d in existing['docs'] if not d['id'].startswith('uniprot::')]
            existing['docs'].extend([{**d, 'embedding': e} for d, e in zip(final_docs, final_embs)])
            existing['generated_at'] = _dt.datetime.now().isoformat()
            index = existing
        except Exception as e:
            print(f'  [warn] failed to merge with existing index: {e}; creating new', file=sys.stderr)
            index = {
                'source': 'uniprot',
                'model': EMBED_MODEL,
                'dim': len(final_embs[0]),
                'generated_at': _dt.datetime.now().isoformat(),
                'docs': [{**d, 'embedding': e} for d, e in zip(final_docs, final_embs)],
            }
    else:
        index = {
            'source': 'uniprot',
            'model': EMBED_MODEL,
            'dim': len(final_embs[0]),
            'generated_at': _dt.datetime.now().isoformat(),
            'docs': [{**d, 'embedding': e} for d, e in zip(final_docs, final_embs)],
        }

    with open(INDEX_PATH, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False)

    print(f'[UniProt] wrote {len(final_docs)} entries to {INDEX_PATH}')
    print(f'[UniProt] total chunks now: {len(index["docs"])}')


if __name__ == '__main__':
    main()