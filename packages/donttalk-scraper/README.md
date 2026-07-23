# donttalk-scraper

LINE Bot + scraper service (Python) — moved from `chat-bot/` at root during
Phase 4 monorepo refactor (2026-07-23).

This is a **separate Python sub-repo**, not part of the ddd Node.js deploy.
Its own `.git/` carries its history; the ddd repo only mirrors the working
tree under `packages/`.

## Run locally
```bash
cd packages/donttalk-scraper
python -m venv .venv && source .venv/bin/activate   # Git Bash
pip install -r requirements.txt   # if present
python agent.py
```

## Notes
- Has its own `.env.example` — copy to `.env` and fill in.
- `.venv/`, `__pycache__/`, `.git/` are gitignored at the ddd root.
- Do not import from the ddd Node.js code — it would break Vercel deploys.