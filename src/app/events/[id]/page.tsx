'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Event, ScanLog, Participant } from '@/types'

interface RecentScan extends ScanLog {
  participant_name: string
  participant_org: string
}

export default function EventDashboard() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [insideCount, setInsideCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const supabase = createClient()

  const loadData = useCallback(async () => {
    const [eventRes, participantsRes, logsRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', id).single(),
      supabase.from('participants').select('*').eq('event_id', id),
      supabase.from('scan_logs').select('*').eq('event_id', id).order('scanned_at', { ascending: false }),
    ])

    if (eventRes.data) setEvent(eventRes.data)

    const participants: Participant[] = participantsRes.data || []
    const logs: ScanLog[] = logsRes.data || []
    setTotalCount(participants.length)

    // 각 참가자의 현재 상태 계산
    const participantMap = new Map(participants.map(p => [p.barcode, p]))
    const statusMap = new Map<string, string>()
    const logsByBarcode = new Map<string, ScanLog[]>()

    logs.forEach(log => {
      if (!logsByBarcode.has(log.barcode)) logsByBarcode.set(log.barcode, [])
      logsByBarcode.get(log.barcode)!.push(log)
    })

    logsByBarcode.forEach((bLogs, barcode) => {
      const sorted = [...bLogs].sort((a, b) => new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime())
      const last = sorted[sorted.length - 1]
      if (last.scan_type === '입장' || last.scan_type === '재입장') {
        statusMap.set(barcode, '내부')
      } else {
        statusMap.set(barcode, '외부')
      }
    })

    setInsideCount(Array.from(statusMap.values()).filter(s => s === '내부').length)

    // 최근 스캔 20개
    const recent = logs.slice(0, 20).map(log => {
      const p = participantMap.get(log.barcode)
      return {
        ...log,
        participant_name: p?.name || '미등록',
        participant_org: p?.organization || '',
      }
    })
    setRecentScans(recent)
  }, [id])

  useEffect(() => {
    loadData()

    const channel = supabase
      .channel('scan_logs_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scan_logs', filter: `event_id=eq.${id}` }, () => {
        loadData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id, loadData])

  const scanTypeColor: Record<string, string> = {
    '입장': 'bg-green-100 text-green-800',
    '퇴장': 'bg-red-100 text-red-800',
    '재입장': 'bg-blue-100 text-blue-800',
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">← 홈</Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{event?.name || '...'}</h1>
        <p className="text-sm text-gray-500 mt-1">{event?.date} · {event?.location}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 text-center">
          <div className="text-3xl font-bold text-blue-600">{insideCount}</div>
          <div className="text-sm text-gray-500 mt-1">현재 내부 인원</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 text-center">
          <div className="text-3xl font-bold text-gray-700">{totalCount}</div>
          <div className="text-sm text-gray-500 mt-1">전체 참가자</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 text-center">
          <div className="text-3xl font-bold text-gray-700">{recentScans.length > 0 ? totalCount - insideCount : 0}</div>
          <div className="text-sm text-gray-500 mt-1">현재 외부 인원</div>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <Link href={`/events/${id}/scan`} className="flex-1 text-center bg-blue-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-blue-700">
          스캔 페이지
        </Link>
        <Link href={`/events/${id}/participants`} className="flex-1 text-center bg-gray-100 text-gray-700 px-4 py-3 rounded-lg text-sm font-medium hover:bg-gray-200">
          참가자 관리
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">최근 스캔 기록</h2>
        </div>
        {recentScans.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">스캔 기록이 없습니다.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentScans.map(scan => (
              <div key={scan.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-900">{scan.participant_name}</span>
                  {scan.participant_org && (
                    <span className="text-sm text-gray-500 ml-2">{scan.participant_org}</span>
                  )}
                  <div className="text-xs text-gray-400 mt-0.5">{scan.barcode}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${scanTypeColor[scan.scan_type]}`}>
                    {scan.scan_type}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(scan.scanned_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
