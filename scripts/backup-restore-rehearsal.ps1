param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^postgres(ql)?://')]
  [string]$SourceDatabaseUrl,

  [string]$PostgresBin,

  [switch]$KeepBackup
)

$ErrorActionPreference = 'Stop'

function Resolve-PgTool([string]$Name) {
  if ($PostgresBin) {
    $candidate = Join-Path $PostgresBin "$Name.exe"
    if (-not (Test-Path -LiteralPath $candidate)) {
      $candidate = Join-Path $PostgresBin $Name
    }
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    throw "PostgreSQL tool not found: $candidate"
  }
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $windowsCandidate = "C:\Program Files\PostgreSQL\18\bin\$Name.exe"
  if (Test-Path -LiteralPath $windowsCandidate) { return $windowsCandidate }
  throw "PostgreSQL tool '$Name' was not found. Pass -PostgresBin."
}

function Invoke-Pg([string]$Tool, [string[]]$Arguments) {
  & $Tool @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL command failed: $([IO.Path]::GetFileName($Tool))"
  }
}

$sourceUri = [Uri]$SourceDatabaseUrl
$sourceDatabase = $sourceUri.AbsolutePath.Trim('/')
if (-not $sourceDatabase) { throw 'Source database name is required.' }
if ($sourceDatabase -match '^mck_restore_rehearsal_') {
  throw 'A rehearsal database cannot be used as the source.'
}

$suffix = "{0}_{1}" -f $PID, [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$restoreDatabase = "mck_restore_rehearsal_$suffix"
if ($restoreDatabase -notmatch '^mck_restore_rehearsal_[0-9]+_[0-9]+$') {
  throw 'Generated restore database name failed the safety check.'
}

$adminBuilder = [UriBuilder]$sourceUri
$adminBuilder.Path = '/postgres'
$adminDatabaseUrl = $adminBuilder.Uri.AbsoluteUri
$restoreBuilder = [UriBuilder]$sourceUri
$restoreBuilder.Path = "/$restoreDatabase"
$restoreDatabaseUrl = $restoreBuilder.Uri.AbsoluteUri

$pgDump = Resolve-PgTool 'pg_dump'
$pgRestore = Resolve-PgTool 'pg_restore'
$psql = Resolve-PgTool 'psql'
$backupPath = Join-Path ([IO.Path]::GetTempPath()) "$restoreDatabase.dump"
$created = $false

$invariantQuery = @'
SELECT 'audit_logs=' || count(*) FROM audit_logs
UNION ALL SELECT 'commercial_documents=' || count(*) FROM commercial_documents
UNION ALL SELECT 'orders=' || count(*) FROM orders
UNION ALL SELECT 'service_requests=' || count(*) FROM service_requests
UNION ALL SELECT 'users=' || count(*) FROM users
ORDER BY 1;
'@

try {
  Invoke-Pg $pgDump @('--dbname', $SourceDatabaseUrl, '--format=custom', '--no-owner', '--no-acl', '--file', $backupPath)
  $artifact = Get-Item -LiteralPath $backupPath
  if ($artifact.Length -le 0) { throw 'Backup artifact is empty.' }

  Invoke-Pg $psql @('--dbname', $adminDatabaseUrl, '--set', 'ON_ERROR_STOP=1', '--command', "CREATE DATABASE $restoreDatabase")
  $created = $true
  Invoke-Pg $pgRestore @('--dbname', $restoreDatabaseUrl, '--no-owner', '--no-acl', '--exit-on-error', $backupPath)

  $sourceTables = (& $psql --dbname $SourceDatabaseUrl --tuples-only --no-align --set ON_ERROR_STOP=1 --command "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('public', 'drizzle')").Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Source schema verification failed.' }
  $restoreTables = (& $psql --dbname $restoreDatabaseUrl --tuples-only --no-align --set ON_ERROR_STOP=1 --command "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('public', 'drizzle')").Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Restored schema verification failed.' }
  $sourceInvariant = (& $psql --dbname $SourceDatabaseUrl --tuples-only --no-align --set ON_ERROR_STOP=1 --command $invariantQuery) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw 'Source record verification failed.' }
  $restoreInvariant = (& $psql --dbname $restoreDatabaseUrl --tuples-only --no-align --set ON_ERROR_STOP=1 --command $invariantQuery) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw 'Restored record verification failed.' }

  if ($sourceTables -ne $restoreTables -or $sourceInvariant -ne $restoreInvariant) {
    throw 'Restore verification mismatch.'
  }

  $checksum = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Output "Backup/restore rehearsal passed: tables=$sourceTables sha256=$checksum"
}
finally {
  if ($created) {
    Invoke-Pg $psql @('--dbname', $adminDatabaseUrl, '--set', 'ON_ERROR_STOP=1', '--command', "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$restoreDatabase' AND pid <> pg_backend_pid()")
    Invoke-Pg $psql @('--dbname', $adminDatabaseUrl, '--set', 'ON_ERROR_STOP=1', '--command', "DROP DATABASE $restoreDatabase")
  }
  if (-not $KeepBackup -and (Test-Path -LiteralPath $backupPath)) {
    Remove-Item -LiteralPath $backupPath -Force
  }
}
