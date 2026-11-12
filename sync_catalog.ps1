# Download the 15 current StarRailRes English reference tables for offline use.
# Run from the extracted hsr-damage-lab folder: powershell -NoProfile -File .\sync_catalog.ps1
$ErrorActionPreference = 'Stop'
$root = 'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/'
$names = @('paths','elements','properties','characters','character_ranks','character_skills','character_skill_trees','character_promotions','light_cones','light_cone_ranks','light_cone_promotions','relics','relic_sets','relic_main_affixes','relic_sub_affixes')
$target = Join-Path $PSScriptRoot 'game-data.js'
$tmp = "$target.tmp"
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Get-Text([string]$uri) {
  $r = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 90
  if ($r.StatusCode -ne 200) { throw "HTTP $($r.StatusCode) at $uri" }
  return [string]$r.Content
}
try {
  Write-Host 'Checking StarRailRes metadata...'
  $infoText = Get-Text ($root + 'info.json')
  $info = $infoText | ConvertFrom-Json
  if (-not $info.version) { throw 'Metadata did not contain a version' }
  [System.IO.File]::WriteAllText($tmp, "/* StarRailRes English data v$($info.version); local reference data only */`nwindow.HSR_GAME_DATA = {`"info`":$infoText,`"tables`":{", $utf8)
  $i = 0
  foreach ($name in $names) {
    $i++
    Write-Host "[$i/$($names.Count)] Downloading $name.json"
    $content = Get-Text ($root + "index_new/en/$name.json")
    $parsed = $content | ConvertFrom-Json
    if ($null -eq $parsed) { throw "Invalid JSON: $name" }
    $prefix = if ($i -gt 1) { ',' } else { '' }
    [System.IO.File]::AppendAllText($tmp, $prefix + '"' + $name + '":' + $content, $utf8)
  }
  [System.IO.File]::AppendAllText($tmp, "}};`n", $utf8)
  $check = (Get-Text ($root + 'info.json')) | ConvertFrom-Json
  if ($info.version -ne $check.version -or $info.timestamp -ne $check.timestamp) { throw 'Upstream version changed during download; run again.' }
  Move-Item -Force -Path $tmp -Destination $target
  Write-Host "Success! Saved $target — StarRailRes version $($info.version)"
  Write-Host 'Open index.html to browse the full catalog offline.'
} catch {
  if (Test-Path $tmp) { Remove-Item -Force $tmp }
  Write-Error $_
  exit 1
}
