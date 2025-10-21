/**
 * Simple PayFast API Tests
 * Run with: node test-payfast-simple.js
 */

const API_BASE = 'https://pool-drizzle-express.onrender.com';

console.log('🧪 Testing PayFast APIs\n');

// Test 1: Health Check
async function testHealth() {
  console.log('1. Health Check...');
  const res = await fetch(`${API_BASE}/api/health`);
  const data = await res.json();
  console.log('   ✅', data, '\n');
}

// Test 2: KZN Shipping (R129)
async function testKZN() {
  console.log('2. KZN Shipping Quote (Expected: R129)...');
  const res = await fetch(`${API_BASE}/api/shipping/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cartTotal: 500,
      destination: { province: 'KwaZulu-Natal', city: 'Durban', postalCode: '4001' },
      outOfArea: false
    })
  });
  const data = await res.json();
  console.log('   ✅', JSON.stringify(data, null, 2), '\n');
}

// Test 3: MAJOR Shipping (R199)
async function testMajor() {
  console.log('3. MAJOR Centre Shipping (Expected: R199)...');
  const res = await fetch(`${API_BASE}/api/shipping/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cartTotal: 800,
      destination: { province: 'Gauteng', city: 'Johannesburg', postalCode: '2000' },
      outOfArea: false
    })
  });
  const data = await res.json();
  console.log('   ✅', JSON.stringify(data, null, 2), '\n');
}

// Test 4: REMOTE Shipping (R279)
async function testRemote() {
  console.log('4. REMOTE Area Shipping (Expected: R279)...');
  const res = await fetch(`${API_BASE}/api/shipping/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cartTotal: 1000,
      destination: { province: 'Limpopo', city: 'Polokwane', postalCode: '0700' },
      outOfArea: false
    })
  });
  const data = await res.json();
  console.log('   ✅', JSON.stringify(data, null, 2), '\n');
}

// Test 5: OAD Surcharge (+R70)
async function testOAD() {
  console.log('5. Out of Area Delivery (Expected: R199 = R129 + R70)...');
  const res = await fetch(`${API_BASE}/api/shipping/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cartTotal: 500,
      destination: { province: 'KwaZulu-Natal', city: 'Durban', postalCode: '4001' },
      outOfArea: true
    })
  });
  const data = await res.json();
  console.log('   ✅', JSON.stringify(data, null, 2), '\n');
}

// Test 6: Free Shipping (≥R1499)
async function testFreeShipping() {
  console.log('6. Free Shipping Threshold (Expected: R0)...');
  const res = await fetch(`${API_BASE}/api/shipping/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cartTotal: 1500,
      destination: { province: 'Gauteng', city: 'Pretoria', postalCode: '0002' },
      outOfArea: false
    })
  });
  const data = await res.json();
  console.log('   ✅', JSON.stringify(data, null, 2), '\n');
}

// Run all tests
(async () => {
  try {
    await testHealth();
    await testKZN();
    await testMajor();
    await testRemote();
    await testOAD();
    await testFreeShipping();
    console.log('✅ All shipping tests completed!\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
})();
