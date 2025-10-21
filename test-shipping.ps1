# PayFast API Quick Tests (PowerShell)
# Copy and paste these commands one by one

Write-Host "`n🧪 PayFast API Tests`n" -ForegroundColor Cyan

# 1. Health Check
Write-Host "1. Health Check..." -ForegroundColor Yellow
Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/health"

# 2. KZN Shipping Quote (R129)
Write-Host "`n2. KZN Shipping (Expected: R129)..." -ForegroundColor Yellow
$body = @{
    cartTotal = 500
    destination = @{
        province = "KwaZulu-Natal"
        city = "Durban"
        postalCode = "4001"
    }
    outOfArea = $false
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/shipping/quote" `
    -Method Post -Body $body -ContentType "application/json"

# 3. MAJOR Centre Shipping (R199)
Write-Host "`n3. MAJOR Centre (Expected: R199)..." -ForegroundColor Yellow
$body = @{
    cartTotal = 800
    destination = @{
        province = "Gauteng"
        city = "Johannesburg"
        postalCode = "2000"
    }
    outOfArea = $false
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/shipping/quote" `
    -Method Post -Body $body -ContentType "application/json"

# 4. REMOTE Area Shipping (R279)
Write-Host "`n4. REMOTE Area (Expected: R279)..." -ForegroundColor Yellow
$body = @{
    cartTotal = 1000
    destination = @{
        province = "Limpopo"
        city = "Polokwane"
        postalCode = "0700"
    }
    outOfArea = $false
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/shipping/quote" `
    -Method Post -Body $body -ContentType "application/json"

# 5. OAD Surcharge (+R70)
Write-Host "`n5. Out of Area (Expected: R199)..." -ForegroundColor Yellow
$body = @{
    cartTotal = 500
    destination = @{
        province = "KwaZulu-Natal"
        city = "Durban"
        postalCode = "4001"
    }
    outOfArea = $true
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/shipping/quote" `
    -Method Post -Body $body -ContentType "application/json"

# 6. Free Shipping (≥R1499)
Write-Host "`n6. Free Shipping (Expected: R0)..." -ForegroundColor Yellow
$body = @{
    cartTotal = 1500
    destination = @{
        province = "Gauteng"
        city = "Pretoria"
        postalCode = "0002"
    }
    outOfArea = $false
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/shipping/quote" `
    -Method Post -Body $body -ContentType "application/json"

Write-Host "`n✅ All tests completed!`n" -ForegroundColor Green
