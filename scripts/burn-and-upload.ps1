# burn-and-upload.ps1 — 一鍵燒 LRClib 歌詞 + 上傳到 https://donttalk.vercel.app/music/
#
# 用法:
#   .\burn-and-upload.ps1 <mp3_path>
#   .\burn-and-upload.ps1 -Dir <mp3_dir>        # 批次跑整個目錄
#   .\burn-and-upload.ps1 <mp3_path> -Artist "正確的歌手"  # 覆蓋 ID3 亂碼
#
# 流程:
#   1. 跑 D:\project\scripts\lyrics-burn.py 自動選 LRClib 第 0 個 LRC 結果
#   2. 把 -lyric.mp3 chunked upload 到 /api/music-upload
#   3. 印結果

param(
  [string]$Mp3Path,
  [string]$Dir,
  [string]$Artist,
  [string]$Password = "123",
  [string]$ApiBase = "https://donttalk.vercel.app",
  [int]$ChunkSizeBytes = 3 * 1024 * 1024,
  [string]$BurnScript = "D:\project\scripts\lyrics-burn.py"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Send-Init($id, $name, $artist, $totalChunks) {
  $body = @{ id = $id; name = $name; artist = $artist; audioType = "audio/mpeg"; totalChunks = $totalChunks } | ConvertTo-Json -Compress
  $r = Invoke-WebRequest -Uri "$ApiBase/api/music-upload?action=init" -Method Post -ContentType "application/json" -Headers @{"x-upload-password" = $Password} -Body $body -UseBasicParsing
  return $r
}

function Send-Chunk($id, $idx, $bytes) {
  $r = Invoke-WebRequest -Uri ("$ApiBase/api/music-upload?action=chunk&id=" + $id + "&idx=" + $idx) -Method Post -ContentType "application/octet-stream" -Headers @{"x-upload-password" = $Password} -Body $bytes -UseBasicParsing
  return $r
}

function Send-Finalize($id, $lyricsText) {
  $body = @{ lyrics = $lyricsText; audioType = "audio/mpeg" } | ConvertTo-Json -Compress
  $r = Invoke-WebRequest -Uri ("$ApiBase/api/music-upload?action=finalize&id=" + $id) -Method Post -ContentType "application/json" -Headers @{"x-upload-password" = $Password} -Body $body -UseBasicParsing
  return $r
}

function Process-One {
  param([Parameter(Mandatory, Position=0)][string]$mp3,
        [Parameter()][string]$artistOverride)

  Write-Host ""
  Write-Host "=== $mp3 ===" -ForegroundColor Cyan

  # 1. 燒歌詞 — 全部用 .NET static method 配 explicit char,繞過 PS5.1 函式內 string literal `\` 變 escape 的 bug
  $slash = [System.IO.Path]::DirectorySeparatorChar
  $lastSlash = $mp3.LastIndexOf($slash)
  if ($lastSlash -gt 0) {
    $dir = $mp3.Substring(0, $lastSlash)
    $filePart = $mp3.Substring($lastSlash + 1)
  } else {
    $dir = "."
    $filePart = $mp3
  }
  $lastDot = $filePart.LastIndexOf('.')
  $base = if ($lastDot -gt 0) { $filePart.Substring(0, $lastDot) } else { $filePart }
  $lyricMp3 = Join-Path $dir ($base + "-lyric.mp3")
  $previewTxt = Join-Path $dir ($base + "-lyrics-preview.txt")

  # lyricMp3 已存在 = 之前燒過,直接用;否則燒新歌詞
  if ((Test-Path $lyricMp3) -and (Test-Path $previewTxt)) {
    Write-Host "  [skip burn] -lyric.mp3 已存在,直接上傳" -ForegroundColor DarkGray
  } else {
    $burnArgs = @($mp3, "--auto", "0")
    # 批次模式不傳 artist (Windows cp950 會吃掉 Unicode),依賴 ID3 title → LRClib 自動選
    if ($artistOverride) { $burnArgs += @("--artist", $artistOverride) }
    & python $BurnScript @burnArgs 2>&1 | Out-Null
  }

  if (-not (Test-Path $lyricMp3)) {
    Write-Host "  [skip] LRClib 找不到歌詞或工具失敗" -ForegroundColor Yellow
    return $false
  }
  if (-not (Test-Path $previewTxt)) {
    Write-Host "  [skip] preview 檔不存在" -ForegroundColor Yellow
    return $false
  }

  # 2. 抽 metadata
  $size = (Get-Item $lyricMp3).Length
  $totalChunks = [int][Math]::Ceiling($size / $ChunkSizeBytes)
  $id = [DateTime]::Now.ToString("yyyyMMddHHmmss") + "-" + (Get-Random -Maximum 9999)
  $name = [System.IO.Path]::GetFileNameWithoutExtension($mp3)
  $lyricsRaw = Get-Content $previewTxt -Raw
  $lyrics = ($lyricsRaw -split "`n" | Where-Object { $_ -notmatch "^#" }) -join "`n"
  if (-not $artistOverride) {
    $artist = "上傳歌曲"
  } else {
    $artist = $artistOverride
  }

  Write-Host "  size: $size, chunks: $totalChunks, id: $id, artist: $artist"

  # 3. init
  $r = Send-Init $id $name $artist $totalChunks
  if ($r.StatusCode -ne 200) {
    Write-Host "  [err] init failed: $($r.Content)" -ForegroundColor Red
    return $false
  }

  # 4. chunks
  $fs = [System.IO.File]::OpenRead($lyricMp3)
  for ($i = 0; $i -lt $totalChunks; $i++) {
    $start = $i * $ChunkSizeBytes
    $len = [Math]::Min($ChunkSizeBytes, $size - $start)
    $buf = New-Object byte[] $len
    $fs.Read($buf, 0, $len) | Out-Null
    $rc = Send-Chunk $id $i $buf
    if ($rc.StatusCode -ne 200) {
      Write-Host "  [err] chunk $i failed: $($rc.Content)" -ForegroundColor Red
      $fs.Close()
      return $false
    }
  }
  $fs.Close()

  # 5. finalize
  $rf = Send-Finalize $id $lyrics
  if ($rf.StatusCode -ne 200) {
    Write-Host "  [err] finalize failed: $($rf.Content)" -ForegroundColor Red
    return $false
  }

  Write-Host "  [ok] uploaded: https://donttalk.vercel.app/api/music-stream?id=$id" -ForegroundColor Green
  return $true
}

# ---- 入口 ----
if ($Dir) {
  $files = Get-ChildItem $Dir -Filter "*.mp3" -File | Where-Object { $_.Name -notmatch "-lyric\.mp3$" }
  Write-Host "找到 $($files.Count) 個 MP3 在 $Dir" -ForegroundColor Yellow
  $ok = 0
  $skip = 0
  foreach ($f in $files) {
    if (Process-One -mp3 $f.FullName -artistOverride $Artist) { $ok++ } else { $skip++ }
  }
  Write-Host ""
  Write-Host "=== 完成：成功 $ok，跳過 $skip ===" -ForegroundColor Cyan
} elseif ($Mp3Path) {
  Process-One -mp3 $Mp3Path -artistOverride $Artist
} else {
  Write-Host "用法:" -ForegroundColor Yellow
  Write-Host "  .\burn-and-upload.ps1 <mp3_path>"
  Write-Host "  .\burn-and-upload.ps1 -Dir <mp3_dir>"
  Write-Host "  .\burn-and-upload.ps1 <mp3_path> -Artist '歌手名'"
}
