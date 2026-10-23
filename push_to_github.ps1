# push_to_github.ps1 - Автоматическая публикация репозитория и первого релиза на GitHub
param(
    [string]$RepoName = "honeybear-vpn",
    [string]$Tag = "v1.2.0"
)

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + [System.Environment]::GetEnvironmentVariable("Path","Machine")
$srcDir = $PSScriptRoot

Write-Host "🐻 HoneyBear VPN — Публикатор GitHub" -ForegroundColor Yellow
Write-Host "Проверка авторизации GitHub CLI (gh)..." -ForegroundColor Cyan

$authStatus = & gh auth status 2>&1
$isLoggedIn = $LASTEXITCODE -eq 0

if (-not $isLoggedIn) {
    Write-Host "`n🔑 Вход в GitHub не выполнен." -ForegroundColor Yellow
    Write-Host "Сейчас откроется браузер для быстрого входа в один клик через GitHub Web..." -ForegroundColor Green
    & gh auth login --web --hostname github.com -p https
    
    $authStatus = & gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Авторизация не была завершена. Попробуйте снова или укажите токен через: gh auth login" -ForegroundColor Red
        Exit 1
    }
}

Write-Host "✅ Авторизация успешна!" -ForegroundColor Green

# Получаем текущего пользователя
$ghUser = (& gh api user --jq .login).Trim()
Write-Host "Пользователь GitHub: $ghUser" -ForegroundColor Cyan

# Проверяем, существует ли уже удаленный репозиторий
$repoExists = $false
try {
    & gh repo view "$ghUser/$RepoName" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $repoExists = $true }
} catch {}

if (-not $repoExists) {
    Write-Host "Создание публичного репозитория $ghUser/$RepoName..." -ForegroundColor Cyan
    & gh repo create "$ghUser/$RepoName" --public --source="$srcDir" --remote=origin --description "HoneyBear VPN - Удобное VPN приложение с акцентом на раздельное туннелирование"
} else {
    Write-Host "Репозиторий $ghUser/$RepoName уже существует. Настройка remote..." -ForegroundColor Yellow
    git remote remove origin 2>&1 | Out-Null
    git remote add origin "git@github.com:$ghUser/$RepoName.git"
}

Write-Host "Отправка кода в ветку main..." -ForegroundColor Cyan
git branch -M main
git push -u origin main

Write-Host "`n📦 Перепаковка свежего app.asar для релиза..." -ForegroundColor Cyan
node "$srcDir\_repack.js"

$asarFile = "$srcDir\release\win-unpacked\resources\app.asar"
if (Test-Path $asarFile) {
    Write-Host "🚀 Создание релиза $Tag на GitHub..." -ForegroundColor Cyan
    
    # Удаляем старый релиз с таким же тегом если был
    & gh release delete $Tag --yes 2>&1 | Out-Null

    & gh release create $Tag $asarFile `
        --title "HoneyBear VPN $Tag" `
        --notes "### 🐻 HoneyBear VPN $Tag`n`n- Удобный и простой VPN клиент.`n- Главная фишка — умное раздельное туннелирование (трафик через VPN только куда нужно).`n- Отборная Hysteria (Hysteria 2) для максимальной скорости и стабильного соединения.`n- Безопасное автообновление с проверкой целостности SHA-256."
    
    Write-Host "`n🎉 Репозиторий и релиз успешно опубликованы!" -ForegroundColor Green
    Write-Host "URL репозитория: https://github.com/$ghUser/$RepoName" -ForegroundColor Yellow
    Write-Host "URL релиза: https://github.com/$ghUser/$RepoName/releases/tag/$Tag" -ForegroundColor Yellow
} else {
    Write-Host "⚠️ Файл app.asar не найден по пути $asarFile. Запустите node _repack.js" -ForegroundColor Red
}
