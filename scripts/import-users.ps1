Write-Host "🚀 Starting users import via API..." -ForegroundColor Green

# Check if server is running
Write-Host "🔍 Checking if server is running..." -ForegroundColor Yellow
try {
    $healthCheck = Invoke-RestMethod -Uri "http://localhost:1735/health" -Method GET -TimeoutSec 5
    Write-Host "✅ Server is running!" -ForegroundColor Green
} catch {
    Write-Host "❌ Server is not running on port 1735. Please start the backend server first." -ForegroundColor Red
    Write-Host "Run: npm run dev or node server.js" -ForegroundColor Yellow
    exit 1
}

# Read the JSON data
Write-Host "📁 Reading users data..." -ForegroundColor Yellow
$jsonPath = Join-Path $PSScriptRoot "api-import-data.json"

if (-not (Test-Path $jsonPath)) {
    Write-Host "❌ File not found: $jsonPath" -ForegroundColor Red
    exit 1
}

$jsonData = Get-Content $jsonPath -Raw

# Send the import request
Write-Host "📊 Sending import request..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:1735/api/users/import" -Method POST -Body $jsonData -ContentType "application/json" -TimeoutSec 30
    
    Write-Host "✅ Import completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Results:" -ForegroundColor Cyan
    Write-Host "• Total: $($response.results.total)" -ForegroundColor White
    Write-Host "• Successful: $($response.results.successful)" -ForegroundColor Green
    Write-Host "• Skipped: $($response.results.skipped)" -ForegroundColor Yellow
    Write-Host "• Errors: $($response.results.errors)" -ForegroundColor Red
    
    if ($response.results.errorDetails -and $response.results.errorDetails.Count -gt 0) {
        Write-Host ""
        Write-Host "❌ Error Details:" -ForegroundColor Red
        foreach ($error in $response.results.errorDetails) {
            Write-Host "• $($error.walletAddress): $($error.error)" -ForegroundColor Red
        }
    }
    
} catch {
    Write-Host "❌ Import failed!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🎉 Import process completed!" -ForegroundColor Green
Read-Host "Press Enter to exit"
