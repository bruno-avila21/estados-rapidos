# Arma el APK release de estados-rapidos, verifica que quedó firmado con la llave PROPIA
# (nunca debug) y lo deja en la raíz del proyecto + en _INSTALABLES.
# Uso:  .\movil\build-apk.ps1

$ErrorActionPreference = 'Stop'
$movil = Split-Path -Parent $MyInvocation.MyCommand.Path
$raiz = Split-Path -Parent $movil

# JDK 17 explícito: el `java` del PATH en esta máquina es JDK 8.
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
Write-Host "JAVA_HOME = $($env:JAVA_HOME)"

# 1) Arma _sitio/ (lo mismo que publican GitHub Pages / Cloudflare Pages). Gradle también lo
#    dispara solo (copiarApp -> armarSitio), pero correrlo acá da el error de golpe si el
#    script rompe, antes de meterse en Gradle.
Push-Location $raiz
try {
    node scripts/armar-sitio.mjs
    if ($LASTEXITCODE) { throw "armar-sitio.mjs fallo" }
} finally { Pop-Location }

# 2) Compila el release. `cmd /c` y no `.\gradlew.bat` directo: PowerShell 5.1 envuelve el
#    stderr de un .exe nativo en NativeCommandError y marca fallo aunque el exit code sea 0
#    (skill crear-apk, bug #21). Se chequea $LASTEXITCODE, no $?.
Push-Location $movil
try {
    cmd /c ".\gradlew.bat --quiet assembleRelease"
    if ($LASTEXITCODE) { throw "gradle fallo ($LASTEXITCODE)" }
} finally { Pop-Location }

$apkCompilado = Get-ChildItem (Join-Path $movil 'app\build\outputs\apk\release\*.apk') | Select-Object -First 1
if (-not $apkCompilado) { throw "No se encontro el APK compilado" }

# 3) LA GUARDA QUE IMPORTA: si esto sale firmado con la llave de debug, no se publica nada.
#    Un release firmado con debug se ve idéntico hasta que hay que reinstalar (skill crear-apk,
#    bug #37: acá va en el script, corta el flujo, no en un warning de Gradle que se silencia).
$sdk = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Android\Sdk' } else { $null }
$apksigner = Get-ChildItem (Join-Path $sdk 'build-tools\*\apksigner.bat') -ErrorAction SilentlyContinue |
             Sort-Object FullName -Descending | Select-Object -First 1
if (-not $apksigner) { throw "No se encontro apksigner.bat en build-tools" }

$certs = & $apksigner.FullName verify --print-certs $apkCompilado.FullName 2>&1
Write-Host $certs
if ($LASTEXITCODE) { throw "apksigner no pudo verificar el APK" }
if ($certs -match 'CN=Android Debug') {
    throw "El APK quedo firmado con la llave de DEBUG. No se publica. Revisa D:\Proyectos_Propios\Agentes\llaves\estados-rapidos.jks y el .credenciales al lado (movil\local.properties debe apuntar ahi con barras normales, no barra invertida simple: bug #37)."
}

# 4) Copia a la raíz del proyecto y a _INSTALABLES (hardlink automático vía instalables.py).
$version = Get-Content (Join-Path $movil 'version.properties') | Where-Object { $_ -match 'versionName=' }
$versionName = ($version -replace 'versionName=', '').Trim()
$destino = Join-Path $raiz "estados-rapidos-$versionName.apk"
Copy-Item $apkCompilado.FullName $destino -Force

$mb = [math]::Round($apkCompilado.Length / 1MB, 2)
Write-Host "`nListo: $destino  ($mb MB, versionName=$versionName)"
Write-Host "Instalar: adb install -r `"$destino`"   (o copiarlo al celular y abrirlo)"

$instalables = 'D:\Proyectos_Propios\_CENTRO-HERRAMIENTAS\instalables.py'
if (Test-Path $instalables) {
    python $instalables --proyecto $raiz --podar
} else {
    Write-Host "(no se encontro instalables.py: el hardlink en _INSTALABLES no se actualizo solo)"
}
