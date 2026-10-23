# prepare-deploy.ps1 - Build the .vercel/output tree that Vercel CLI 58 prebuilt can deploy.
#
# Why this exists: Vercel CLI 59 spawn cmd.exe ENOENT blocks prebuilt deploys in Windows,
# so we cannot let `vercel build` produce the .vercel/output/. We construct it manually:
#   1. .vercel/output/static/   <- rebuild of astro/dist/ minus the excluded files
#   2. .vercel/output/config.json + builds.json (cleaned: target=production, no cached errors)
#   3. .vercel/output/functions/api/catchall.func/ <- edge function copied from cache
#   4. config.json `routes` field rewrites /api/* to /api/catchall (the dispatch happens inside)
#
# The catchall.mjs source is the August 2026 edge-runtime version that was successfully
# deployed to production. It's kept under .vercel/.vercel/output/ as Vercel CLI's cache;
# we copy it into .vercel/output/functions/api/catchall.func/ before deploying.
#
# Usage: after `npm run build`, run this from astro/:
#   powershell -ExecutionPolicy Bypass -File scripts/prepare-deploy.ps1
#   & node_modules\.bin\vercel.cmd deploy --prebuilt --prod --yes --archive tgz

$ErrorActionPreference = 'Stop'

$astroDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $astroDir

# 1. mirror astro/dist to .vercel/output/static (only if dist is newer / empty .vercel/output/static)
$distPath = Join-Path $astroDir 'dist'
$staticOut = Join-Path $astroDir '.vercel\output\static'

if (Test-Path $distPath) {
    Write-Host "[1/5] Rebuilding .vercel/output/static from dist ..." -ForegroundColor Cyan
    # 2026-10-23 rewrite of the mirror step:
    #   - the old shutil.copy2 loop never created missing sub-dirs -> WinError 3 abort
    #     (hit as soon as dist/games/<game>/ appeared).
    #   - shutil.copytree(dirs_exist_ok=True) merges, so leftovers from an older run
    #     survived and the payload drifted between deploys.
    #   - now: wipe static/ first, then copy, then apply the exclude list.
    #   - the inline python below is ASCII only on purpose: PowerShell 5.1 reads this
    #     .ps1 as ANSI, so non-ASCII inside the inline python is a portability risk.
    #   - Vercel Hobby static upload limit is 100MB. The site shipped 227MB before
    #     (background videos + superseded 3D models + duplicated music), the platform
    #     silently truncated the upload and tail files 404'd. The exclude list keeps
    #     the payload small and the deploy deterministic.
    python -c @"
import os, re, shutil, sys

src = r'$distPath'
dst = r'$staticOut'

EXCLUDE = [
    'bg*.mp4',                   # background videos: only the retired ImmersiveBackground used them
    '**/*.old',                  # stale backups (models/*.glb.old)
    '**/*.bak',
    'models/mascot-3d-full.glb', # the 3d-mascot page now uses models/mascot-3d.glb
    'models/mascot-3d-tiny.glb',
    'models/chibi-blender-v1.glb',
    'models/chibi-restyle-v1.glb',
    # 2026-10-23: img/mascot-*.png was excluded as a reference sheet that no page
    # referenced - stale. /3d-mascot/ loads /img/mascot-front.png as its kawaii
    # fallback, so excluding the pattern 404'd the fallback on both deploy paths.
    # All four together are ~1.2MB, noise against the 100MB cap.
    'images/chibi-hero-run.jpg',
    'music/*.mp3',               # the player streams audio from jsDelivr (tracks.json url field)
    'music/*.txt',               # legacy plain-text lyrics
    'music/*.lrc',               # timed lyrics are embedded in tracks.json (lyricsTimed field)
]

def to_re(p):
    out, i = '', 0
    while i < len(p):
        if p.startswith('**/', i):
            out += '(?:.*/)?'; i += 3
        elif p[i] == '*':
            out += '[^/]*'; i += 1
        elif p[i] == '?':
            out += '[^/]'; i += 1
        else:
            out += re.escape(p[i]); i += 1
    return re.compile('^' + out + '$')

try:
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
except Exception as exc:
    print('MIRROR FAILED: %r' % (exc,))
    sys.exit(1)

rx = [to_re(p) for p in EXCLUDE]
removed, freed = 0, 0
for dirpath, _, files in os.walk(dst, topdown=False):
    for f in files:
        full = os.path.join(dirpath, f)
        rel = os.path.relpath(full, dst).replace(os.sep, '/')
        if any(r.match(rel) for r in rx):
            freed += os.path.getsize(full)
            os.remove(full)
            removed += 1

total, payload = 0, 0
for dirpath, _, files in os.walk(dst):
    for f in files:
        total += 1
        payload += os.path.getsize(os.path.join(dirpath, f))
print('mirror: %d files, %.1f MB (excluded %d files, %.1f MB)'
      % (total, payload / 1048576, removed, freed / 1048576))
if payload > 100 * 1048576:
    print('WARNING: payload exceeds the Vercel Hobby 100MB static upload limit')
"@
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: mirror step failed - aborting deploy" -ForegroundColor Red
        exit 1
    }
    $count = (Get-ChildItem -Recurse $staticOut -File).Count
    $size = [math]::Round((Get-ChildItem -Recurse $staticOut -File | Measure-Object Length -Sum).Sum / 1MB, 1)
    Write-Host "       deploy payload: $count files, $size MB (Vercel Hobby limit 100MB)" -ForegroundColor Green
} else {
    Write-Host "WARN: dist/ not found, run 'npm run build' first" -ForegroundColor Yellow
}

# 2. config.json: version 3 + routes for catchall + cache headers
#
#    2026-10-23: every asset shipped with `Cache-Control: public, max-age=0,
#    must-revalidate`, so a repeat visit re-validated the whole 23MB game payload
#    before showing anything. Astro's /_astro/* files are content-hashed and the
#    mirrored game's assets never change, so both get a long immutable cache.
#    HTML stays must-revalidate so an updated page is picked up immediately.
#
#    Note: `Set-Content -Encoding UTF8` in PowerShell 5.1 writes a BOM, so the
#    file is emitted through python instead (json.dump is UTF-8 without BOM).
#    Below also adds a cleanUrls parity route: every internal link on this site
#    is already a clean URL (verified: 9 internal hrefs, 0 with a trailing
#    slash), which matches the git build's root vercel.json (cleanUrls:true).
#    Without it the prebuilt deploy serves trailing-slash URLs and every
#    internal link costs an extra 308.
Write-Host "[2/5] Writing config.json with catchall routes + cache headers ..." -ForegroundColor Cyan
python -c @"
import json

# Build Output API v3 has NO top-level `headers` key. Response headers must be
# carried by a routes[] entry, and there they are a flat {name: value} map -
# not the [{key, value}] shape vercel.json uses. A top-level headers array is
# silently ignored, which is what produced the first no-op deploy on 2026-10-23.
#
# These routes come before the /api routes and set continue:true so they tag the
# response and then fall through to the filesystem handler.
#
# NOTE: this here-string is PowerShell-interpolated, so it must not contain a
# bare dollar sign, and the alternation uses a plain capturing group, not (?:...).
ASSET_EXT = 'webp|png|jpg|svg|mp3|wav|mp4|woff2|json'

IMMUTABLE = 'public, max-age=31536000, immutable'

cfg = {
    'version': 3,
    'routes': [
        {
            'src': '/games/confinement-escape/(.*)\\.(%s)' % ASSET_EXT,
            'headers': {'Cache-Control': IMMUTABLE},
            'continue': True,
        },
        {
            'src': '/games/confinement-escape/images/(.*)',
            'headers': {'Cache-Control': IMMUTABLE},
            'continue': True,
        },
        {
            'src': '/games/confinement-escape/music/(.*)',
            'headers': {'Cache-Control': IMMUTABLE},
            'continue': True,
        },
        {
            'src': '/games/confinement-escape/sfx/(.*)',
            'headers': {'Cache-Control': IMMUTABLE},
            'continue': True,
        },
        {
            'src': '/_astro/(.*)',
            'headers': {'Cache-Control': IMMUTABLE},
            'continue': True,
        },
        {'src': '/api/(.*)', 'dest': '/api/catchall'},
        {'src': '/healthz',  'dest': '/api/catchall/healthz'},
        {'src': '/og',       'dest': '/api/catchall/og'},
        # cleanUrls parity with the git build (root vercel.json cleanUrls:true).
        # Must sit before the filesystem handler: normalise the URL first, then
        # look up the real file.
        {'src': '/(.*)/', 'status': 308, 'headers': {'Location': '/' + chr(0x24) + '1'}},
        {'handle': 'filesystem'},
    ],
}
json.dump(cfg, open('.vercel/output/config.json', 'w', encoding='utf-8'), indent=2)
print('config.json ok: %d route(s), %d with cache headers'
      % (len(cfg['routes']),
         sum(1 for r in cfg['routes'] if 'headers' in r)))
"@
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: config.json step failed - aborting deploy" -ForegroundColor Red
        exit 1
    }

# 3. Copy catchall function from Vercel CLI cache
#    Note: Vercel CLI keeps its build cache at <project-root>/.vercel/.vercel/,
#    which is D:\project\.vercel\.vercel\ (NOT astro/.vercel/.vercel/).
Write-Host "[3/5] Copying catchall.func from cache ..." -ForegroundColor Cyan
$projectRoot = Split-Path $astroDir -Parent
$cacheFunc = Join-Path $projectRoot '.vercel\.vercel\output\functions\api\catchall.func'
$outFunc = '.vercel\output\functions\api\catchall.func'
if (Test-Path $cacheFunc) {
    New-Item -ItemType Directory -Force -Path $outFunc | Out-Null
    Copy-Item "$cacheFunc\catchall.mjs" "$outFunc\catchall.mjs" -Force
    Copy-Item "$cacheFunc\.vc-config.json" "$outFunc\.vc-config.json" -Force
    $size = (Get-Item "$outFunc\catchall.mjs").Length
    Write-Host "       $outFunc\catchall.mjs ($size bytes from $cacheFunc)" -ForegroundColor Green
} else {
    Write-Host "ERROR: catchall func source not found at $cacheFunc" -ForegroundColor Red
    Write-Host "       Re-link via: npx vercel link --yes --project donttalk" -ForegroundColor Red
    exit 1
}

# 4. builds.json: target=production, no cached errors, no zzz-invalidate-cache
#    2026-10-23: .vercel/output 被清掉時 builds.json 會跟著不見 → 直接重建。
#    Build Output API v3：靜態檔由 static/ 帶上，builds.json 只列 function。
Write-Host "[4/5] Cleaning builds.json ..." -ForegroundColor Cyan
python -c @"
import json, os
p='.vercel/output/builds.json'
if os.path.exists(p):
    d=json.load(open(p))
    d['target']='production'
    d.pop('error',None)
    d['builds']=[b for b in d.get('builds',[]) if 'zzz-invalidate-cache' not in b.get('src','')]
else:
    d={'target':'production','builds':[{'src':'.vercel/output/functions/api/catchall.func/catchall.mjs','use':'@vercel/edge','config':{}}]}
for b in d['builds']:
    if 'catchall' in b.get('src',''):
        b['src']='.vercel/output/functions/api/catchall.func/catchall.mjs'
        b['use']='@vercel/edge'
        b.pop('require',None)
        b.pop('requirePath',None)
        b['config']={}
d['//']='manual prebuilt + catchall.func (edge runtime)'
json.dump(d, open(p,'w'), indent=2)
print('builds.json ok:', len(d['builds']), 'build(s)')
"@

# 5. Verify OIDC token is set
Write-Host "[5/5] Checking Vercel OIDC token ..." -ForegroundColor Cyan
if (-not $env:VERCEL_OIDC_TOKEN) {
    $envFile = '.vercel\.env.development.local'
    if (Test-Path $envFile) {
        $env:VERCEL_OIDC_TOKEN = (Select-String -Path $envFile -Pattern 'VERCEL_OIDC_TOKEN').Line -replace '^VERCEL_OIDC_TOKEN="|"$',''
        Write-Host "       loaded from $envFile (length=$($env:VERCEL_OIDC_TOKEN.Length))" -ForegroundColor Green
    } else {
        Write-Host "ERROR: VERCEL_OIDC_TOKEN not set and $envFile not found" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "       VERCEL_OIDC_TOKEN already set (length=$($env:VERCEL_OIDC_TOKEN.Length))" -ForegroundColor Green
}

Write-Host ""
Write-Host "Ready to deploy. Next command:" -ForegroundColor Green
Write-Host "  & node_modules\.bin\vercel.cmd deploy --prebuilt --prod --yes --archive tgz" -ForegroundColor Yellow
