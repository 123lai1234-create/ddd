$mavis = "C:\Users\User\.mavis\bin\mavis.cmd"
$prompt = @'
Poll the GCP Audience tab (tabId 751771534) for OAuth test-user count.

Step 1 - Run this exact command:
  mavis browser tool query '{"tabId":751771534,"what":"page_text","selector":"body"}'

Step 2 - Parse the response. Look for a regex match like '(\d+)\s*位使用者' in the 'content' field.

Step 3a - If the count matches '1 位使用者' or higher:
   a. Delete the cron: mavis cron delete mavis poll-audience
   b. Restart the herms OAuth flow from D:\project\.secrets\herms-oauth-flow.md
      (use refresh_token from D:\project\.secrets\google-tokens.json)
   c. Once OAuth succeeds, kick off the 33 long-term fetches workflow
      (see D:\project\.secrets\long-term-fetch-state.md).
   d. Report to user: 'OAuth test user 加好了，OAuth flow 啟動中'

Step 3b - If still 0 位使用者:
   - Stay quiet. Do not message user. Do not spam.
   - Cron will tick again in 2 min.

Step 3c - If page text shows an error or 'NOT FOUND', log error but stay quiet.

Step 3d - After 6 consecutive ticks (12 minutes) of still 0, message user ONCE:
   'JT — Audience tab 還停在 0 位使用者，我看到你可能還沒加。方便加一下嗎？'

Tab URL reminder: https://console.cloud.google.com/auth/audience?project=herms-496408
'@

$args = @(
    $mavis, "cron", "self", "poll-audience",
    "--every", "2m",
    "--prompt", $prompt,
    "--ttl", "30m",
    "--no-quiet-on-skip"
)

Write-Host "Running: $($args -join ' ')"
& $args[0] $args[1..($args.Length-1)]
