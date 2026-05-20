Set-Location D:/f.bain/frontend
flutter build web

if ($LASTEXITCODE -eq 0) {
    Remove-Item -Path "../static/*" -Recurse -Force -ErrorAction SilentlyContinue

    Copy-Item -Path "build/web/*" -Destination "../static" -Recurse -Force
    Write-Host "Build copied to ../static successfully." -ForegroundColor Green

} else {
    Write-Error "Flutter build failed with exit code $LASTEXITCODE"
}