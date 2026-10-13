"""
RAG ingest: 把 astro pages / PDFs / repo code / protein/gene 內容 → embed → 存到 .rag/index.json
用法:
  python scripts/rag-ingest.py [--source all|astro|pdf|repo]
# 環境變數: OLLAMA_URL (default http://localhost:11434), OLLAMA_EMBED_MODEL (default nomic-embed-text)
"""
import argparse
import datetime as _dt
import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

try:
    import pypdf
except ImportError:
    print('ERR: pypdf not installed (pip install pypdf)', file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent.parent
RAG_DIR = ROOT / '.rag'
INDEX_PATH = RAG_DIR / 'index.json'
OLLAMA_URL = os.getenv('OLLAMA_URL', 'http://localhost:11434')
EMBED_MODEL = os.getenv('OLLAMA_EMBED_MODEL', 'nomic-embed-text')

CHUNK_TARGET = 600
CHUNK_OVERLAP = 80
PDF_CHUNK_TARGET = 300
PDF_CHUNK_OVERLAP = 50
MIN_CHUNK = 50

PROTEIN_KEYWORDS = ('gene', 'protein', 'ngs', 'stem-cell', 'mpnn')


def chunk_text(text: str, target: int = CHUNK_TARGET, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """split by paragraph, then hard-wrap with overlap"""
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    if not text:
        return []
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    out = []
    for p in paragraphs:
        if len(p) <= target:
            out.append(p)
        else:
            i = 0
            while i < len(p):
                end = min(i + target, len(p))
                out.append(p[i:end])
                if end >= len(p):
                    break
                i = max(end - overlap, i + 1)
    return out


def extract_astro(path: Path) -> str:
    raw = path.read_text(encoding='utf-8', errors='ignore')
    m = re.match(r'^---\n(.*?)\n---\s*', raw, re.DOTALL)
    fm = m.group(1) if m else ''
    body = raw[m.end():] if m else raw
    body = re.sub(r'<script[^>]*>.*?</script>', ' ', body, flags=re.DOTALL)
    body = re.sub(r'<style[^>]*>.*?</style>', ' ', body, flags=re.DOTALL)
    body = re.sub(r'<[^>]+>', ' ', body)
    body = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', body)
    body = re.sub(r'[ \t]+', ' ', body)
    body = re.sub(r'\n{2,}', '\n\n', body)
    return (fm + '\n\n' + body).strip()


def extract_pdf(path: Path) -> list[tuple[int, str]]:
    """Per-page extraction. Returns list of (page_no, text)."""
    reader = pypdf.PdfReader(str(path))
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            t = page.extract_text() or ''
        except Exception:
            continue
        if t.strip():
            pages.append((i, t))
    return pages


def extract_repo_py(path: Path) -> str:
    txt = path.read_text(encoding='utf-8', errors='ignore')
    txt = re.sub(r'"""[\s\S]*?"""', ' ', txt)
    txt = re.sub(r"'''[\s\S]*?'''", ' ', txt)
    txt = re.sub(r'^#.*$', '', txt, flags=re.MULTILINE)
    txt = re.sub(r'\n{2,}', '\n\n', txt)
    return txt


def classify_source(rel_path: str) -> str:
    lower = rel_path.lower()
    if any(k in lower for k in PROTEIN_KEYWORDS):
        return 'protein'
    if lower.endswith('.pdf'):
        return 'pdf'
    if lower.endswith(('.py', '.js', '.ts', '.md')) and ('astro/src/' not in lower and 'pages/' not in lower):
        return 'repo'
    return 'astro'


def collect_docs(source_filter: str) -> list[dict]:
    docs: list[dict] = []

    # 1. astro pages
    if source_filter in ('all', 'astro'):
        astro_root = ROOT / 'astro' / 'src' / 'pages'
        if astro_root.exists():
            for f in astro_root.rglob('*.astro'):
                rel = str(f.relative_to(ROOT)).replace('\\', '/')
                try:
                    txt = extract_astro(f)
                except Exception as e:
                    print(f'  [skip astro] {rel}: {e}', file=sys.stderr)
                    continue
                src = classify_source(rel)
                for i, chunk in enumerate(chunk_text(txt)):
                    if len(chunk) < MIN_CHUNK:
                        continue
                    docs.append({
                        'id': f'{rel}::c{i}',
                        'source': src,
                        'path': rel,
                        'text': chunk,
                        'meta': {'file': f.name, 'chunk_index': i},
                    })

    # 3. PDFs (per-page, finer chunks for academic content)
    if source_filter in ('all', 'pdf'):
        for f in (ROOT / 'docs').rglob('*.pdf'):
            rel = str(f.relative_to(ROOT)).replace('\\', '/')
            try:
                pages = extract_pdf(f)
            except Exception as e:
                print(f'  [skip pdf] {rel}: {e}', file=sys.stderr)
                continue
            for page_no, page_text in pages:
                for i, chunk in enumerate(chunk_text(page_text, target=PDF_CHUNK_TARGET, overlap=PDF_CHUNK_OVERLAP)):
                    if len(chunk) < MIN_CHUNK:
                        continue
                    docs.append({
                        'id': f'{rel}::p{page_no}::c{i}',
                        'source': 'pdf',
                        'path': rel,
                        'text': f'[p.{page_no}] ' + chunk,
                        'meta': {'file': f.name, 'page': page_no, 'chunk_index': i},
                    })

    # 4. repo (packages/donttalk-scraper Python + 其他 readme)
    if source_filter in ('all', 'repo'):
        for sub in (ROOT / 'packages',):
            if not sub.exists():
                continue
            for f in sub.rglob('*'):
                if not f.is_file():
                    continue
                if '.venv' in str(f) or '__pycache__' in str(f):
                    continue
                if f.suffix not in ('.py', '.md'):
                    continue
                rel = str(f.relative_to(ROOT)).replace('\\', '/')
                try:
                    if f.suffix == '.py':
                        txt = extract_repo_py(f)
                    else:
                        txt = f.read_text(encoding='utf-8', errors='ignore')
                except Exception:
                    continue
                for i, chunk in enumerate(chunk_text(txt)):
                    if len(chunk) < MIN_CHUNK:
                        continue
                    docs.append({
                        'id': f'{rel}::c{i}',
                        'source': 'repo',
                        'path': rel,
                        'text': chunk,
                        'meta': {'file': f.name, 'chunk_index': i},
                    })

    return docs


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
    p.add_argument('--source', default='all',
                   choices=['all', 'astro', 'pdf', 'repo'],
                   help='which sources to ingest')
    p.add_argument('--workers', type=int, default=2)
    args = p.parse_args()

    RAG_DIR.mkdir(exist_ok=True)
    print(f'[RAG] collecting docs (source={args.source}) ...', flush=True)
    docs = collect_docs(args.source)
    print(f'[RAG] {len(docs)} chunks ready', flush=True)

    if not docs:
        print('[RAG] nothing to do', flush=True)
        return

    # source breakdown
    breakdown = {}
    for d in docs:
        breakdown[d['source']] = breakdown.get(d['source'], 0) + 1
    for k, v in breakdown.items():
        print(f'  - {k}: {v} chunks', flush=True)

    print(f'[RAG] embedding via {EMBED_MODEL} @ {OLLAMA_URL}, workers={args.workers}', flush=True)

    embeddings: list[list[float] | None] = [None] * len(docs)
    failures = 0

    def work(i, text):
        return i, embed(text)

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(work, i, d['text']): i for i, d in enumerate(docs)}
        done = 0
        for fut in as_completed(futs):
            try:
                i, vec = fut.result()
                embeddings[i] = vec
            except Exception as e:
                failures += 1
                idx = futs[fut]
                print(f'  [embed fail] doc {idx}: {e}', file=sys.stderr)
            done += 1
            if done % 10 == 0 or done == len(docs):
                print(f'  embedded {done}/{len(docs)} (fail={failures})', flush=True)

    # drop failures
    final_docs = []
    final_embs = []
    for d, e in zip(docs, embeddings):
        if e is None:
            continue
        final_docs.append(d)
        final_embs.append(e)

    if not final_embs:
        print('[RAG] all embeddings failed', file=sys.stderr)
        sys.exit(1)

    index = {
        'source': args.source,
        'model': EMBED_MODEL,
        'dim': len(final_embs[0]),
        'generated_at': _dt.datetime.now().isoformat(),
        'docs': [{**d, 'embedding': e} for d, e in zip(final_docs, final_embs)],
    }

    with open(INDEX_PATH, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False)

    size_mb = INDEX_PATH.stat().st_size / 1024 / 1024
    print(f'[RAG] wrote {INDEX_PATH}: {len(final_docs)} chunks, {index["dim"]}-dim, {size_mb:.1f} MB')


if __name__ == '__main__':
    main()