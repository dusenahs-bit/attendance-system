'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { ScanType } from '@/types'

interface ScanResult {
  barcode: string
  name: string
  organization: string
  scan_type: ScanType
  scanned_at: string
  found: boolean
}

export default function ScanPage() {
  const { id } = useParams<{ id: string }>()
  const [eventName, setEventName] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [lastResult, setLastResult] = useState<ScanResult | null>(null)
  const [recentResults, setRecentResults] = useState<ScanResult[]>([])
  const [processing, setProcessing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('events').select('name').eq('id', id).single().then(({ data }) => {
      if (data) setEventName(data.name)
    })
    // 페이지 진입 시 포커스
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [id])

  // 인풋이 포커스를 잃으면 즉시 되돌림
  const handleBlur = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 10)
  }, [])

  // 탭 전환 후 돌아왔을 때 포커스 복귀
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setTimeout(() => inputRef.current?.focus(), 100)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const processScan = useCallback(async (barcode: string) => {
    if (!barcode.trim() || processing) return
    setProcessing(true)

    try {
      // 참가자 조회
      const { data: participant } = await supabase
        .from('participants')
        .select('*')
        .eq('event_id', id)
        .eq('barcode', barcode.trim())
        .single()

      // 이전 스캔 이력 조회
      const { data: prevLogs } = await supabase
        .from('scan_logs')
        .select('*')
        .eq('event_id', id)
        .eq('barcode', barcode.trim())
        .order('scanned_at', { ascending: false })
        .limit(1)

      // 다음 scan_type 자동 결정
      let scan_type: ScanType = '입장'
      if (prevLogs && prevLogs.length > 0) {
        const lastType = prevLogs[0].scan_type as ScanType
        if (lastType === '입장' || lastType === '재입장') {
          scan_type = '퇴장'
        } else {
          scan_type = '재입장'
        }
      }

      // 스캔 기록 저장
      const { data: newLog } = await supabase
        .from('scan_logs')
        .insert({ event_id: id, barcode: barcode.trim(), scan_type })
        .select()
        .single()

      const result: ScanResult = {
        barcode: barcode.trim(),
        name: participant?.name || '미등록 참가자',
        organization: participant?.organization || '',
        scan_type,
        scanned_at: newLog?.scanned_at || new Date().toISOString(),
        found: !!participant,
      }

      setLastResult(result)
      setRecentResults(prev => [result, ...prev.slice(0, 9)])
    } finally {
      setProcessing(false)
      setInputValue('')
      inputRef.current?.focus()
    }
  }, [id, processing])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      processScan(inputValue)
    }
  }

  const scanTypeStyle: Record<ScanType, { bg: string; text: string; border: string }> = {
    '입장': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    '퇴장': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    '재입장': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/events/${id}`} className="text-sm text-gray-500 hover:text-gray-700">← 대시보드</Link>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-1">스캔</h1>
      <p className="text-sm text-gray-500 mb-6">{eventName}</p>

      {/* 스캔 입력 */}
      <div className="bg-white rounded-xl shadow-sm border-2 border-blue-300 p-6 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          바코드 스캔 (Enter로 확인)
        </label>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={processing}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          placeholder="바코드를 스캔하세요..."
          autoComplete="off"
        />
        <p className="text-xs text-gray-400 mt-2">USB 바코드 스캐너로 스캔하면 자동 처리됩니다.</p>
      </div>

      {/* 마지막 스캔 결과 */}
      {lastResult && (
        <div className={`rounded-xl border-2 p-5 mb-4 ${
          !lastResult.found
            ? 'bg-yellow-50 border-yellow-300'
            : scanTypeStyle[lastResult.scan_type].bg + ' border-' + (lastResult.scan_type === '입장' ? 'green' : lastResult.scan_type === '퇴장' ? 'red' : 'blue') + '-300'
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-2xl font-bold text-gray-900">{lastResult.name}</div>
              {lastResult.organization && (
                <div className="text-sm text-gray-600 mt-0.5">{lastResult.organization}</div>
              )}
              <div className="text-xs text-gray-400 mt-1">{lastResult.barcode}</div>
            </div>
            <div className={`text-lg font-bold px-3 py-1 rounded-full ${
              lastResult.scan_type === '입장' ? 'bg-green-600 text-white' :
              lastResult.scan_type === '퇴장' ? 'bg-red-600 text-white' :
              'bg-blue-600 text-white'
            }`}>
              {lastResult.scan_type}
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-3">
            {new Date(lastResult.scanned_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            {!lastResult.found && <span className="ml-2 text-yellow-700 font-medium">⚠ 명단에 없는 바코드</span>}
          </div>
        </div>
      )}

      {/* 최근 스캔 목록 */}
      {recentResults.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-medium text-gray-700">이전 스캔</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {recentResults.slice(1).map((r, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-800">{r.name}</span>
                  {r.organization && <span className="text-xs text-gray-400 ml-2">{r.organization}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.scan_type === '입장' ? 'bg-green-100 text-green-700' :
                    r.scan_type === '퇴장' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{r.scan_type}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(r.scanned_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
