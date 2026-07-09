# Despliega los workflows CRM Lite a una instancia n8n vía API pública.
# Sirve para la instancia actual o para una nueva (migración de servidor):
#   .\n8n\deploy-workflows.ps1                                          # instancia actual
#   .\n8n\deploy-workflows.ps1 -BaseUrl https://n8n.NUEVO-DOMINIO -IdsFile n8n-ids.nuevo.local
#
# El ids-file (formato clave=valor, git-ignored) debe tener los IDs de credenciales de ESA
# instancia (se crean a mano en el panel n8n, ver docs/MIGRACION-SERVIDOR.md):
#   n8n_webhook_secret_cred_id=...      (Header Auth x-crm-lite-webhook-secret)
#   n8n_integration_secret_cred_id=...  (Header Auth, mismo secreto)
#   n8n_ghl_credential_id=...           (Header Auth Authorization GHL)
#   n8n_discord_cred_id=...             (Discord webhook de alertas)
# Los IDs de workflows se agregan/actualizan solos tras el primer deploy.
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$BaseUrl = 'https://n8n.stlabs.ar',
  [string]$IdsFile = 'n8n-ids.local',
  [string]$SecretsFile = 'crm-secrets.local.env',
  [string]$ApiKeyName = 'apikeyn8n'
)

$BaseUrl = $BaseUrl.TrimEnd('/')
$secretsPath = Join-Path $RepoRoot $SecretsFile
$idsPath = if ([System.IO.Path]::IsPathRooted($IdsFile)) { $IdsFile } else { Join-Path $RepoRoot $IdsFile }
if (-not (Test-Path $secretsPath)) { throw "Falta $secretsPath" }

function Read-KvFile { param([string]$Path)
  $map = @{}
  if (Test-Path $Path) {
    Get-Content $Path | ForEach-Object {
      if ($_ -match '^([^#=]+)=(.*)$') { $map[$matches[1].Trim()] = $matches[2].Trim() }
    }
  }
  return $map
}

$envMap = Read-KvFile $secretsPath
$apiKey = $envMap[$ApiKeyName]
if (-not $apiKey) { throw "Falta $ApiKeyName en $SecretsFile" }
$idMap = Read-KvFile $idsPath

# IDs "canónicos" embebidos en los JSON del repo (instancia original) → clave del ids-file.
# Al importar a otra instancia se reemplazan por los IDs reales de esa instancia.
$credCanonical = @{
  'rZvKjdRnF39vlXHi' = 'n8n_webhook_secret_cred_id'
  'kXuV2N3VSnbLhe57' = 'n8n_integration_secret_cred_id'
  'gw0VVz43aChxVaFA' = 'n8n_ghl_credential_id'
  '9EySCq47m7R905UO' = 'n8n_discord_cred_id'
}
foreach ($k in $credCanonical.Keys) {
  $idsKey = $credCanonical[$k]
  if (-not $idMap[$idsKey]) { throw "Falta $idsKey en $IdsFile (crear la credencial en n8n y anotar su ID)" }
}

$headers = @{
  'X-N8N-API-KEY' = $apiKey
  'Accept'        = 'application/json'
  'Content-Type'  = 'application/json; charset=utf-8'
}
$base = "$BaseUrl/api/v1"

function Invoke-N8nJson {
  param([string]$Method, [string]$Uri, [string]$JsonBody)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($JsonBody)
  return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers -Body $bytes
}

function Set-WorkflowActive {
  param([string]$Id, [bool]$Active)
  try {
    $action = if ($Active) { 'activate' } else { 'deactivate' }
    Invoke-RestMethod -Uri "$base/workflows/$Id/$action" -Method Post -Headers $headers | Out-Null
  } catch {
    Write-Warning "activate/deactivate $Id : $($_.Exception.Message)"
  }
}

# Workflows ya existentes en la instancia (para actualizar por nombre y no duplicar)
$existing = @{}
try {
  (Invoke-RestMethod -Uri "$base/workflows?limit=200" -Headers $headers).data |
    ForEach-Object { if (-not $existing.ContainsKey($_.name)) { $existing[$_.name] = $_.id } }
} catch {
  Write-Warning "No se pudo listar workflows existentes: $($_.Exception.Message)"
}

function Read-WorkflowJson {
  param([string]$Path)
  $raw = Get-Content $Path -Raw -Encoding UTF8
  # Sustituir IDs de credenciales canónicos por los de esta instancia
  foreach ($old in $credCanonical.Keys) {
    $raw = $raw.Replace($old, $idMap[$credCanonical[$old]])
  }
  # Sustituir la URL de la instancia original por la destino (ej. Re-Push en retry.json)
  $raw = $raw.Replace('https://n8n.stlabs.ar', $BaseUrl)
  return $raw | ConvertFrom-Json
}

function Import-WorkflowFile {
  param([string]$Path, [string]$IdKey, [string]$ErrorWorkflowId = $null, [bool]$Activate = $true)

  $wf = Read-WorkflowJson $Path
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

  # Resolución del ID destino: ids-file primero, después por nombre (evita duplicar)
  $id = $idMap[$IdKey]
  if (-not $id -and $existing.ContainsKey($wf.name)) { $id = $existing[$wf.name] }

  if ($id) {
    Invoke-N8nJson -Method Put -Uri "$base/workflows/$id" -JsonBody $json | Out-Null
    Write-Host "UPDATED $($wf.name) ($id)"
  } else {
    $result = Invoke-N8nJson -Method Post -Uri "$base/workflows" -JsonBody $json
    $id = $result.id
    Write-Host "CREATED $($wf.name) ($id)"
  }
  $idMap[$IdKey] = $id

  if ($Activate) {
    Set-WorkflowActive -Id $id -Active $true
    Write-Host "  activated"
  } else {
    Set-WorkflowActive -Id $id -Active $false
    Write-Host "  inactive (template)"
  }

  return $id
}

# 1. Alertas primero (las demás lo referencian como errorWorkflow)
$alertsId = Import-WorkflowFile -Path (Join-Path $RepoRoot 'n8n\workflows\crm-lite\shared\alerts.json') -IdKey 'n8n_alerts_workflow_id' -Activate:$true

# 2. Flujos GHL activos
$ghlFiles = @{
  'push.json'        = 'n8n_push_workflow_id'
  'pull.json'        = 'n8n_pull_workflow_id'
  'tags.json'        = 'n8n_tags_workflow_id'
  'retry.json'       = 'n8n_retry_workflow_id'
  'inbound.json'     = 'n8n_inbound_workflow_id'
  'auto-import.json' = 'n8n_auto_import_workflow_id'
  'pipelines.json'   = 'n8n_pipelines_workflow_id'
}
foreach ($f in @('push.json','pull.json','tags.json','retry.json','inbound.json','auto-import.json','pipelines.json')) {
  Import-WorkflowFile -Path (Join-Path $RepoRoot "n8n\workflows\crm-lite\ghl\$f") -IdKey $ghlFiles[$f] -ErrorWorkflowId $alertsId -Activate:$true | Out-Null
}

# 3. Plantillas HubSpot/Pipedrive (inactivas; se actualizan por nombre, no se duplican)
$templateKeys = @{
  'hubspot\push.json'   = 'n8n_tpl_hubspot_push_id'
  'hubspot\pull.json'   = 'n8n_tpl_hubspot_pull_id'
  'pipedrive\push.json' = 'n8n_tpl_pipedrive_push_id'
  'pipedrive\pull.json' = 'n8n_tpl_pipedrive_pull_id'
}
foreach ($rel in $templateKeys.Keys) {
  Import-WorkflowFile -Path (Join-Path $RepoRoot "n8n\workflows\crm-lite\$rel") -IdKey $templateKeys[$rel] -Activate:$false | Out-Null
}

# 4. Persistir el ids-file actualizado
$lines = $idMap.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Key)=$($_.Value)" }
Set-Content -Path $idsPath -Value $lines -Encoding ascii
Write-Host "`nIDs guardados en $idsPath"
