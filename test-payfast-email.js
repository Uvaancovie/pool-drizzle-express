const crypto = require('crypto');

// Your actual PayFast credentials from .env
const MERCHANT_ID = '10499773';
const MERCHANT_KEY = 'ddt6r1lkzsc2w';
const PASSPHRASE = ''; // Leave empty if you don't have one

// Use a real order ID from your recent test
const PAYMENT_ID = 'ORD-1768819994063-U7K6UMS'; // Replace with your actual payment ID

const itnData = {
  m_payment_id: PAYMENT_ID,
  pf_payment_id: 'TEST-' + Date.now(),
  payment_status: 'COMPLETE',
  item_name: '1 item from Pool Beanbags',
  item_description: 'Test Order',
  amount_gross: '4000.00',
  amount_fee: '40.00',
  amount_net: '3960.00',
  custom_str1: 'test-order-id',
  name_first: 'Test',
  name_last: 'Customer',
  email_address: 'test@example.com',
  merchant_id: MERCHANT_ID,
};

// Generate signature
const pfOutput = Object.keys(itnData)
  .sort()
  .map(key => `${key}=${encodeURIComponent(itnData[key]).replace(/%20/g, '+')}`)
  .join('&');

const signatureString = PASSPHRASE ? pfOutput + `&passphrase=${encodeURIComponent(PASSPHRASE)}` : pfOutput;
const signature = crypto.createHash('md5').update(signatureString).digest('hex');

// Add signature to data
const payload = { ...itnData, signature };

console.log('Sending test ITN to backend...');
console.log('Payment ID:', PAYMENT_ID);

fetch('http://localhost:4000/api/payfast/itn', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(payload),
})
  .then(res => {
    console.log('Response status:', res.status);
    return res.text();
  })
  .then(text => {
    console.log('Response:', text);
    console.log('\n✅ Check orders@poolbeanbags.co.za for the email!');
  })
  .catch(err => console.error('Error:', err));
