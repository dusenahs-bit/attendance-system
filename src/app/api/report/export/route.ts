export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import { Participant, ScanLog } from '@/types'

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `0:${String(m).padStart(2, '0')}`
}

function calcStats(pLogs: ScanLog[], now: Date = new Date()) {
  let inside_ms = 0
  let outside_ms = 0
  let entry_time: Date | null = null

  for (let i = 0; i < pLogs.length; i++) {
    const log = pLogs[i]
    const t = new Date(log.scanned_at)
    if (log.scan_type === '입장' || log.scan_type === '재입장') {
      entry_time = t
      if (i > 0 && pLogs[i - 1].scan_type === '퇴장') {
        outside_ms += t.getTime() - new Date(pLogs[i - 1].scanned_at).getTime()
      }
    } else if (log.scan_type === '퇴장' && entry_time) {
      inside_ms += t.getTime() - entry_time.getTime()
      entry_time = null
    }
  }

  const lastLog = pLogs[pLogs.length - 1]
  const status = (lastLog.scan_type === '입장' || lastLog.scan_type === '재입장') ? '내부' : '외부'

  return {
    status,
    first_entry: pLogs.find(l => l.scan_type === '입장')?.scanned_at || null,
    last_exit: [...pLogs].reverse().find(l => l.scan_type === '퇴장')?.scanned_at || null,
    inside_minutes: Math.round(inside_ms / 60000),
    outside_minutes: Math.round(outside_ms / 60000),
    scan_count: pLogs.length,
  }
}

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const event_id = req.nextUrl.searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const [eventRes, participantsRes, logsRes] = await Promise.all([
    supabase.from('events').select('*').eq('id', event_id).single(),
    supabase.from('participants').select('*').eq('event_id', event_id).order('number'),
    supabase.from('scan_logs').select('*').eq('event_id', event_id).order('scanned_at', { ascending: true }),
  ])

  const event = eventRes.data
  const participants: Participant[] = participantsRes.data || []
  const logs: ScanLog[] = logsRes.data || []
  const now = new Date()

  // 참가자 map
  const participantMap = new Map(participants.map(p => [p.barcode, p]))

  // 스캔된 모든 고유 바코드 수집
  const scannedBarcodes = Array.from(new Set(logs.map(l => l.barcode)))

  // 참가자 기준 rows (번호 순서 유지)
  const reportRows: {
    number: number | string
    name: string
    organization: string
    barcode: string
    status: string
    first_entry: string | null
    last_exit: string | null
    inside_minutes: number
    outside_minutes: number
    scan_count: number
  }[] = []

  // 등록된 참가자
  participants.forEach(p => {
    const pLogs = logs.filter(l => l.barcode === p.barcode)
    if (pLogs.length === 0) {
      reportRows.push({ number: p.number, name: p.name, organization: p.organization, barcode: p.barcode, status: '미입장', first_entry: null, last_exit: null, inside_minutes: 0, outside_minutes: 0, scan_count: 0 })
    } else {
      reportRows.push({ number: p.number, name: p.name, organization: p.organization, barcode: p.barcode, ...calcStats(pLogs, now) })
    }
  })

  // 명단에 없지만 스캔된 바코드 추가
  scannedBarcodes.forEach(barcode => {
    if (participantMap.has(barcode)) return // 이미 위에서 처리
    const pLogs = logs.filter(l => l.barcode === barcode)
    reportRows.push({ number: '-', name: '미등록', organization: '', barcode, ...calcStats(pLogs, now) })
  })

  // 엑셀 생성
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('체류시간 리포트')

  ws.columns = [
    { header: '번호', key: 'number', width: 8 },
    { header: '이름', key: 'name', width: 12 },
    { header: '소속', key: 'org', width: 20 },
    { header: '바코드', key: 'barcode', width: 18 },
    { header: '현재상태', key: 'status', width: 10 },
    { header: '최초입장', key: 'first_entry', width: 12 },
    { header: '최종퇴장', key: 'last_exit', width: 12 },
    { header: '내부체류(H:MM)', key: 'inside', width: 16 },
    { header: '외부체류(H:MM)', key: 'outside', width: 16 },
    { header: '스캔횟수', key: 'scan_count', width: 10 },
  ]

  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
    cell.alignment = { horizontal: 'center' }
  })

  const fmt = (dt: string | null) => dt ? new Date(dt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) : '-'

  reportRows.forEach(r => {
    ws.addRow({
      number: r.number,
      name: r.name,
      org: r.organization,
      barcode: r.barcode,
      status: r.status,
      first_entry: fmt(r.first_entry),
      last_exit: fmt(r.last_exit),
      inside: r.status === '미입장' ? '-' : r.inside_minutes > 0 ? minutesToHHMM(r.inside_minutes) : '0:00',
      outside: r.outside_minutes > 0 ? minutesToHHMM(r.outside_minutes) : '-',
      scan_count: r.scan_count,
    })
  })

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    row.eachCell(cell => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } }
    })
    if (rowNumber % 2 === 0) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
      })
    }
  })

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`체류시간_리포트_${event?.name || ''}.xlsx`)}`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  })
}
