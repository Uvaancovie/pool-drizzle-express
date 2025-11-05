const crypto = require('crypto');

// Your credentials
const SITE_CODE = 'MAE-POO-001';
const PRIVATE_KEY = '683F684FDE785F9C936B8D66E86D9';

// Test data (matching your last attempt)
const data = {
  SiteCode: 'MAE-POO-001',
  CountryCode: 'ZA',
  CurrencyCode: 'ZAR',
  Amount: '1400.00',
  TransactionReference: 'ORD-TEST123',
  BankReference: 'POOLBAGS-TEST',
  CancelUrl: 'https://www.poolbeanbags.co.za/checkout/cancel',
  ErrorUrl: 'https://www.poolbeanbags.co.za/checkout/error',
  SuccessUrl: 'https://www.poolbeanbags.co.za/checkout/success',
  NotifyUrl: 'https://pool-drizzle-express.onrender.com/api/ozow/notify',
  IsTest: 'false'
};

// Build hash string (11 fields in exact order)
const hashString = 
  data.SiteCode +
  data.CountryCode +
  data.CurrencyCode +
  data.Amount +
  data.TransactionReference +
  data.BankReference +
  data.CancelUrl +
  data.ErrorUrl +
  data.SuccessUrl +
  data.NotifyUrl +
  data.IsTest +
  PRIVATE_KEY;

console.log('\n=== OZOW HASH TEST ===\n');
console.log('1. Hash String (before lowercase):');
console.log(hashString);
console.log('\n2. Hash String (after lowercase):');
const lowerHashString = hashString.toLowerCase();
console.log(lowerHashString);
console.log('\n3. SHA-512 Hash:');
const hash = crypto.createHash('sha512').update(lowerHashString).digest('hex');
console.log(hash);
console.log('\n4. Full Ozow POST data:');
console.log(JSON.stringify({...data, HashCheck: hash}, null, 2));

// Now test with IsTest='true'
console.log('\n\n=== NOW TESTING WITH IsTest="true" ===\n');
const dataTest = {...data, IsTest: 'true'};
const hashStringTest = 
  dataTest.SiteCode +
  dataTest.CountryCode +
  dataTest.CurrencyCode +
  dataTest.Amount +
  dataTest.TransactionReference +
  dataTest.BankReference +
  dataTest.CancelUrl +
  dataTest.ErrorUrl +
  dataTest.SuccessUrl +
  dataTest.NotifyUrl +
  dataTest.IsTest +
  PRIVATE_KEY;
const hashTest = crypto.createHash('sha512').update(hashStringTest.toLowerCase()).digest('hex');
console.log('SHA-512 Hash with IsTest=true:');
console.log(hashTest);
console.log('\nFull POST data:');
console.log(JSON.stringify({...dataTest, HashCheck: hashTest}, null, 2));
