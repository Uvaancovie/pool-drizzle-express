#!/usr/bin/env node
// Simple ITN simulator for PayFast to post form-encoded notification to your ITN endpoint.
// Usage: node tools/simulate-itn.js <m_payment_id> <amount_gross> [COMPLETE|FAILED|CANCELLED]

const crypto = require('crypto')
const fetch = global.fetch || require('node-fetch')

async function main(){
  const [,, m_payment_id, amount_gross, status='COMPLETE'] = process.argv
  if(!m_payment_id || !amount_gross){
    console.error('Usage: node tools/simulate-itn.js <m_payment_id> <amount_gross> [status]')
    process.exit(2)
  }

  const itnUrl = process.env.ITN_URL || 'https://pool-drizzle-express.onrender.com/api/payfast/itn'

  const payload = {
    m_payment_id,
    payment_status: status,
    amount_gross: String(amount_gross),
    pf_payment_id: `PF-${Date.now()}`
  }

  // Build signature: sort keys, encodeURIComponent and replace %20 with +, join with &
  const sorted = Object.keys(payload).sort()
  const qs = sorted.map(k => `${k}=${encodeURIComponent(String(payload[k])).replace(/%20/g,'+')}`).join('&')
  const signature = crypto.createHash('md5').update(qs).digest('hex')

  const body = qs + `&signature=${signature}`

  console.log('Posting ITN to', itnUrl)
  console.log('Payload:', payload)

  const res = await fetch(itnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  const text = await res.text()
  console.log('Response:', res.status, text)
}

main().catch(e=>{ console.error(e); process.exit(1) })
