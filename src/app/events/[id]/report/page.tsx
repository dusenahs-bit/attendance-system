'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Participant, ScanLog } from '@/types'

interface ParticipantReport {
  number: number | string
  name: string
  organization: string
  barcode: string
  status: '내부' | '외부' | '미입장'
  first_entry: string | null
  last_exit: string | null
  inside_minutes: number
  outside_minutes: number
  scan_count: number
}

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>()
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [reports, setReports] = useState<ParticipantReport[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const supabase = createClient()

  const buildReports = useCallback(async () => {
    const [participantsRes, logsRes] = await Promise.all([
      supabase.from('participants').select('*').eq('event_id', id).order('number'),
      supabase.from('scan_logs').select('*').eq('event_id', id).order('scanned_at', { ascending: true }),
    ])

    const participants: Participant[] = participantsRes.data || []
    const logs: ScanLog[] = logsRes.data || []
    const result: ParticipantReport[] = participants.map(p => {
      const pLogs = logs.filter(l => l.barcode === p.barcode)

      if (pLogs.length === 0) {
        return { number: p.number, name: p.name, organization: p.organization, barcode: p.barcode, status: '미입장', first_entry: null, last_exit: null, inside_minutes: 0, outside_minutes: 0, scan_count: 0 }
      }

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

      // 현재 내부에 있는 경우 지금까지의 시간도 포함
      if (entry_time !== null) {
        inside_ms += Date.now() - entry_time.getTime()
      }

      const lastLog = pLogs[pLogs.length - 1]
      const currentStatus: '내부' | '외부' = (lastLog.scan_type === '입장' || lastLog.scan_type === '재입장') ? '내부' : '외부'

      return {
        number: p.number,
        name: p.name,
        organization: p.organization,
        barcode: p.barcode,
        status: currentStatus,
        first_entry: pLogs.find(l => l.scan_type === '입장')?.scanned_at || null,
        last_exit: [...pLogs].reverse().find(l => l.scan_type === '퇴장')?.scanned_at || null,
        inside_minutes: Math.round(inside_ms / 60000),
        outside_minutes: Math.round(outside_ms / 60000),
        scan_count: pLogs.length,
      }
    })

    // 명단에 없지만 스캔된 바코드 추가
    const participantBarcodes = new Set(participants.map(p => p.barcode))
    const scannedBarcodes = Array.from(new Set(logs.map(l => l.barcode)))
    scannedBarcodes.forEach(barcode => {
      if (participantBarcodes.has(barcode)) return
      const pLogs = logs.filter(l => l.barcode === barcode)
      const lastLog = pLogs[pLogs.length - 1]
      const currentStatus: '내부' | '외부' = (lastLog.scan_type === '입장' || lastLog.scan_type === '재입장') ? '내부' : '외부'
      let inside_ms = 0, outside_ms = 0
      let entry_time: Date | null = null
      for (let i = 0; i < pLogs.length; i++) {
        const t = new Date(pLogs[i].scanned_at)
        if (pLogs[i].scan_type === '입장' || pLogs[i].scan_type === '재입장') {
          entry_time = t
          if (i > 0 && pLogs[i-1].scan_type === '퇴장') outside_ms += t.getTime() - new Date(pLogs[i-1].scanned_at).getTime()
        } else if (pLogs[i].scan_type === '퇴장' && entry_time) {
          inside_ms += t.getTime() - entry_time.getTime(); entry_time = null
        }
      }
      if (entry_time !== null) {
        inside_ms += Date.now() - entry_time.getTime()
      }
      result.push({ number: '-', name: '미등록', organization: '', barcode, status: currentStatus, first_entry: pLogs.find(l => l.scan_type === '입장')?.scanned_at || null, last_exit: [...pLogs].reverse().find(l => l.scan_type === '퇴장')?.scanned_at || null, inside_minutes: Math.round(inside_ms/60000), outside_minutes: Math.round(outside_ms/60000), scan_count: pLogs.length })
    })

    setReports(result)
    setLoading(false)
  }, [id])

  useEffect(() => {
    supabase.from('events').select('name,date').eq('id', id).single().then(({ data }) => {
      if (data) { setEventName(data.name); setEventDate(data.date) }
    })
    buildReports()
  }, [id, buildReports])

  async function downloadExcel() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/report/export?event_id=${id}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `체류시간_리포트_${eventName}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const statusColor: Record<string, string> = {
    '내부': 'bg-green-100 text-green-700',
    '외부': 'bg-red-100 text-red-700',
    '미입장': 'bg-gray-100 text-gray-500',
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/events/${id}`} className="text-sm text-gray-500 hover:text-gray-700">← 대시보드</Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">체류시간 리포트</h1>
          <p className="text-sm text-gray-500 mt-0.5">{eventName}{eventDate && <span className="ml-2 text-gray-400">· {eventDate}</span>}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={buildReports}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
          >
            새로고침
          </button>
          <button
            onClick={downloadExcel}
            disabled={downloading}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {downloading ? '다운로드 중...' : '엑셀 다운로드'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">로딩 중...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">번호</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">이름</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">소속</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">현재 상태</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">최초 입장</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">최종 퇴장</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">내부 체류</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">외부 체류</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">스캔 횟수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reports.map(r => (
                <tr key={r.barcode} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-400">{r.number}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.organization}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {r.first_entry ? new Date(r.first_entry).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {r.last_exit ? new Date(r.last_exit).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-700">
                    {r.inside_minutes > 0 ? minutesToHHMM(r.inside_minutes) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500">
                    {r.outside_minutes > 0 ? minutesToHHMM(r.outside_minutes) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-400">{r.scan_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
