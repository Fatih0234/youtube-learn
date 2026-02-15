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

  const { error: processError } = await supabase.rpc('process_welcome_emails')
  if (processError) {
    console.error('process_welcome_emails failed:', processError)
    return NextResponse.json({ error: 'process_welcome_emails failed' }, { status: 500 })
  }

  const { error: responsesError } = await supabase.rpc('handle_welcome_email_responses')
  if (responsesError) {
    console.error('handle_welcome_email_responses failed:', responsesError)
    return NextResponse.json({ error: 'handle_welcome_email_responses failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    ran: ['process_welcome_emails', 'handle_welcome_email_responses'],
    durationMs: Date.now() - startedAt,
  })
}

