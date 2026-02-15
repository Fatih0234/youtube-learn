import { NextRequest } from 'next/server'

export function requireCronAuth(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Fail closed if not configured.
    return { ok: false as const, status: 500, message: 'CRON_SECRET is not configured' }
  }

  const auth = req.headers.get('authorization') ?? ''
  const [scheme, token] = auth.split(' ')

  if (scheme !== 'Bearer' || token !== secret) {
    return { ok: false as const, status: 401, message: 'Unauthorized' }
  }

  return { ok: true as const }
}

