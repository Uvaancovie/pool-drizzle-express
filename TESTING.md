# PayFast Integration Testing Guide

## Quick Tests Using cURL (PowerShell)

### 1. Health Check
```powershell
Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/health" -Method Get
```

### 2. Test Shipping Quote - KZN (R129, 1-2 days)
```powershell
$body = @{
    province = "KwaZulu-Natal"
    city = "Durban"
    postalCode = "4001"
    cartTotal = 500
    isOutsideArea = $false
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/shipping/quote" -Method Post -Body $body -ContentType "application/json"
```

### 3. Test Shipping Quote - MAJOR Centre (R199, 2-3 days)
```powershell
$body = @{
    province = "Gauteng"
    city = "Johannesburg"
    postalCode = "2000"
    cartTotal = 800
    isOutsideArea = $false
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/shipping/quote" -Method Post -Body $body -ContentType "application/json"
```

### 4. Test Shipping Quote - REMOTE (R279, 3-5 days)
```powershell
$body = @{
    province = "Limpopo"
    city = "Polokwane"
    postalCode = "0700"
    cartTotal = 1000
    isOutsideArea = $false
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/shipping/quote" -Method Post -Body $body -ContentType "application/json"
```

### 5. Test OAD Surcharge (+R70)
```powershell
$body = @{
    province = "KwaZulu-Natal"
    city = "Durban"
    postalCode = "4001"
    cartTotal = 500
    isOutsideArea = $true  # OAD enabled
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/shipping/quote" -Method Post -Body $body -ContentType "application/json"
```
**Expected:** R199 (R129 + R70)

### 6. Test Free Shipping (≥R1499)
```powershell
$body = @{
    province = "Gauteng"
    city = "Pretoria"
    postalCode = "0002"
    cartTotal = 1500  # Above threshold
    isOutsideArea = $false
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/shipping/quote" -Method Post -Body $body -ContentType "application/json"
```
**Expected:** R0 (free shipping)

### 7. Test Checkout API (Order + PayFast Signature)
```powershell
$body = @{
    items = @(
        @{
            productId = "507f1f77bcf86cd799439011"
            title = "Test Pool Beanbag"
            quantity = 2
            price = 45000
        }
    )
    customer = @{
        firstName = "John"
        lastName = "Doe"
        email = "john.doe@example.com"
        phone = "0821234567"
    }
    shipping = @{
        address = "123 Test Street"
        suburb = "Suburb"
        city = "Durban"
        province = "KwaZulu-Natal"
        postalCode = "4001"
        country = "South Africa"
    }
    totals = @{
        subtotal = 900
        shipping = 129
        discount = 0
        vat = 0
        grandTotal = 1029
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/checkout" -Method Post -Body $body -ContentType "application/json"
```
**Expected:** Returns orderId and PayFast redirect URL with signature

---

## Using Node.js Test Script

Run the automated test suite:

```powershell
cd d:\pool-beanbags\backend
node test-payfast.js
```

---

## Testing Frontend Checkout Flow

1. Navigate to: `https://www.poolbeanbags.co.za/checkout/payfast`
2. Fill in the form with test data
3. Select a province and observe shipping quote update
4. Toggle "Outside Area Delivery (OAD)" and watch price adjust
5. Submit the form
6. Should redirect to PayFast sandbox (if in test mode) or live PayFast

---

## Testing PayFast ITN Webhook (Sandbox Only)

PayFast will POST to: `https://pool-drizzle-express.onrender.com/api/payfast/itn`

**ITN Test Payload:**
```json
{
  "m_payment_id": "ORDER_ID_HERE",
  "pf_payment_id": "12345",
  "payment_status": "COMPLETE",
  "item_name": "Pool Beanbags Order",
  "amount_gross": "1029.00",
  "amount_fee": "23.67",
  "amount_net": "1005.33",
  "signature": "generated_by_payfast"
}
```

---

## Expected Results Summary

| Test | Province | City | Cart Total | OAD | Expected Price | Delivery Time |
|------|----------|------|------------|-----|----------------|---------------|
| KZN | KwaZulu-Natal | Durban | R500 | No | R129 | 1-2 days |
| MAJOR | Gauteng | Johannesburg | R800 | No | R199 | 2-3 days |
| REMOTE | Limpopo | Polokwane | R1000 | No | R279 | 3-5 days |
| OAD | KwaZulu-Natal | Durban | R500 | Yes | R199 | 1-2 days |
| FREE | Any | Any | R1500+ | Any | R0 | Varies |

---

## Troubleshooting

### Backend not responding
```powershell
# Check if backend is deployed
Invoke-RestMethod -Uri "https://pool-drizzle-express.onrender.com/api/health"
```

### Shipping quote returns error
- Check province spelling (case-insensitive but must be valid SA province)
- Verify cartTotal is a number, not string
- Ensure isOutsideArea is boolean

### Checkout fails
- Verify all required fields are present
- Check that product IDs are valid MongoDB ObjectIds or slugs
- Ensure totals are in cents for prices, not rands

### ITN webhook not working
- Verify webhook URL in PayFast merchant dashboard
- Check Render logs for incoming POST requests
- Ensure signature verification is working (no passphrase set)

---

## Live Testing Checklist

- [ ] Health check passes
- [ ] KZN shipping quote returns R129
- [ ] MAJOR shipping quote returns R199
- [ ] REMOTE shipping quote returns R279
- [ ] OAD surcharge adds R70
- [ ] Free shipping works for cart ≥R1499
- [ ] Checkout creates order and generates signature
- [ ] Frontend form updates shipping dynamically
- [ ] PayFast redirect URL is valid
- [ ] ITN webhook receives and processes notifications
- [ ] Order status updates to 'paid' after successful payment
