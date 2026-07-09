# Despliega workflows CRM Lite a n8n.stlabs.ar vía API pública.
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$secretsPath = Join-Path $RepoRoot 'crm-secrets.local.env'
$idsPath = Join-Path $RepoRoot 'n8n-ids.local'
if (-not (Test-Path $secretsPath)) { throw "Falta $secretsPath" }

$envMap = @{}
Get-Content $secretsPath | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { $envMap[$matches[1].Trim()] = $matches[2].Trim() }
}
$apiKey = $envMap['apikeyn8n']
if (-not $apiKey) { throw 'Falta apikeyn8n' }

$idMap = @{}
if (Test-Path $idsPath) {
  Get-Content $idsPath | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') { $idMap[$matches[1].Trim()] = $matches[2].Trim() }
  }
}

$headers = @{
  'X-N8N-API-KEY' = $apiKey
  'Accept'        = 'application/json'
  'Content-Type'  = 'application/json; charset=utf-8'
}
$base = 'https://n8n.stlabs.ar/api/v1'

$fileToIdKey = @{
  'push.json'        = 'n8n_push_workflow_id'
  'pull.json'        = 'n8n_pull_workflow_id'
  'tags.json'        = 'n8n_tags_workflow_id'
  'alerts.json'      = 'n8n_alerts_workflow_id'
  'retry.json'       = 'n8n_retry_workflow_id'
  'inbound.json'     = 'n8n_inbound_workflow_id'
  'auto-import.json' = 'n8n_auto_import_workflow_id'
  'pipelines.json'   = 'n8n_pipelines_workflow_id'
}

function Invoke-N8nJson {
  param([string]$Method, [string]$Uri, [string]$JsonBody)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($JsonBody)
  return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers -Body $bytes
}

function Set-WorkflowActive {
  param([string]$Id, [bool]$Active)
  try {
    if ($Active) {
      Invoke-RestMethod -Uri "$base/workflows/$Id/activate" -Method Post -Headers $headers | Out-Null
    } else {
      Invoke-RestMethod -Uri "$base/workflows/$Id/deactivate" -Method Post -Headers $headers | Out-Null
    }
  } catch {
    Write-Warning "activate/deactivate $Id : $($_.Exception.Message)"
  }
}

function Import-WorkflowFile {
  param([string]$Path, [string]$IdKey, [string]$ErrorWorkflowId = $null, [bool]$Activate = $true)

  $fileName = Split-Path $Path -Leaf
  $wf = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  $settings = @{}
  if ($wf.settings) {
    $wf.settings.PSObject.Properties | ForEach-Object { $settings[$_.Name] = $_.Value }
  }
  if ($ErrorWorkflowId) { $settings['errorWorkflow'] = $ErrorWorkflowId }

  $bodyObj = @{
    name        = $wf.name
    nodes       = $wf.nodes
    connections = $wf.connections
    settings    = $settings
  }
  $json = $bodyObj | ConvertTo-Json -Depth 100

  $id = $idMap[$IdKey]
  if ($id) {
    Invoke-N8nJson -Method Put -Uri "$base/workflows/$id" -JsonBody $json | Out-Null
    Write-Host "UPDATED $($wf.name) ($id)"
  } else {
    $result = Invoke-N8nJson -Method Post -Uri "$base/workflows" -JsonBody $json
    $id = $result.id
    $idMap[$IdKey] = $id
    Write-Host "CREATED $($wf.name) ($id)"
  }

  if ($Activate -and $wf.meta.inactiveByDefault -ne $true) {
    Set-WorkflowActive -Id $id -Active $true
    Write-Host "  activated"
  } elseif ($wf.meta.inactiveByDefault -eq $true) {
    Set-WorkflowActive -Id $id -Active $false
    Write-Host "  inactive (template)"
  }

  return $id
}

$ordered = @(
  @{ Path = Join-Path $RepoRoot 'n8n\workflows\crm-lite\shared\alerts.json'; Key = 'n8n_alerts_workflow_id'; Activate = $true }
) + @(
  'push.json','pull.json','tags.json','retry.json','inbound.json','auto-import.json','pipelines.json' | ForEach-Object {
    $f = $_
  @{ Path = Join-Path $RepoRoot "n8n\workflows\crm-lite\ghl\$f"; Key = $fileToIdKey[$f]; Activate = $true }
  }
)

$alertsId = Import-WorkflowFile -Path $ordered[0].Path -IdKey $ordered[0].Key -Activate:$true
foreach ($item in $ordered[1..($ordered.Length - 1)]) {
  Import-WorkflowFile -Path $item.Path -IdKey $item.Key -ErrorWorkflowId $alertsId -Activate:$item.Activate | Out-Null
}

# Templates (inactive)
Get-ChildItem (Join-Path $RepoRoot 'n8n\workflows\crm-lite\hubspot'), (Join-Path $RepoRoot 'n8n\workflows\crm-lite\pipedrive') -Filter '*.json' -ErrorAction SilentlyContinue | ForEach-Object {
  $wf = Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
  $bodyObj = @{ name = $wf.name; nodes = $wf.nodes; connections = $wf.connections; settings = @{} }
  $json = $bodyObj | ConvertTo-Json -Depth 100
  try {
    Invoke-N8nJson -Method Post -Uri "$base/workflows" -JsonBody $json | Out-Null
    Write-Host "TEMPLATE $($wf.name)"
  } catch {}
}

Write-Host "`nActualizar n8n-ids.local:"
$idMap.GetEnumerator() | Sort-Object Name | ForEach-Object { Write-Host "$($_.Key)=$($_.Value)" }
