const crypto = require('node:crypto')

const CRM_INTAKE = 'https://logoorbit-crm.vercel.app/api/briefs/intake'
const MAX_BODY_BYTES = 96 * 1024

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('X-Content-Type-Options', 'nosniff')

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  const rawBody = typeof request.body === 'string'
    ? request.body
    : JSON.stringify(request.body || {})

  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return response.status(413).json({ error: 'Submission is too large' })
  }

  const headers = {
    'Content-Type': 'application/json',
    Origin: 'https://logoorbit-brief.vercel.app',
  }
  const secret = process.env.CRM_INTAKE_SECRET
  if (secret && secret.length >= 32) {
    const timestamp = Date.now().toString()
    headers['X-LogoOrbit-Timestamp'] = timestamp
    headers['X-LogoOrbit-Signature'] = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')
  }

  try {
    const upstream = await fetch(CRM_INTAKE, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(15_000),
    })
    const text = await upstream.text()
    response.status(upstream.status)
    response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    return response.send(text)
  } catch (error) {
    console.error('CRM brief proxy failed:', error)
    return response.status(502).json({ error: 'Could not deliver the brief right now' })
  }
}
