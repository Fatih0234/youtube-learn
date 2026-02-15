import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/app/api/cron/_utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = requireCronAuth(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  const supabase = createServiceRoleClient()
  const startedAt = Date.now()

  const { error } = await supabase.rpc('cleanup_old_welcome_emails')
  if (error) {
    console.error('cleanup_old_welcome_emails failed:', error)
    return NextResponse.json({ error: 'cleanup_old_welcome_emails failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    ran: ['cleanup_old_welcome_emails'],
    durationMs: Date.now() - startedAt,
  })
}

