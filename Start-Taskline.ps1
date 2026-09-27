$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$tasklineNodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($tasklineNodeCommand) {
    $tasklineNode = $tasklineNodeCommand.Source
} else {
    $tasklineNode = 'C:\Users\Kent\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $tasklineNode)) { throw 'Install Node.js 22.13 or newer, then run npm run install:ci and npm run dev.' }
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules/vinext/dist/cli.js'))) { throw 'Dependencies are missing. Run npm run install:ci first.' }
$env:PATH = (Split-Path -Parent $tasklineNode) + ';' + $env:PATH
Write-Host 'Starting Taskline. Open http://localhost:5173/ for Auth0 sign-in (not the numeric 127.0.0.1 address). Keep this terminal open.'
& $tasklineNode (Join-Path $PSScriptRoot 'scripts/dev.mjs')
