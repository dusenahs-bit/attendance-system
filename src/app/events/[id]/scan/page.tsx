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
  const [queueSize, setQueueSize] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueRef = useRef<string[]>([])
  const processingRef = useRef(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('events').select('name').eq('id', id).single().then(({ data }) => {
      if (data) setEventName(data.name)
    })
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [id])

  // 500ms마다 포커스 강제 유지
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.activeElement !== inputRef.current && !document.hidden) {
        inputRef.current?.focus()
      }
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const handleBlur = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  // 큐에서 하나씩 꺼내 순서대로 처리
  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    if (queueRef.current.length === 0) return

    processingRef.current = true
    setIsProcessing(true)

    while (queueRef.current.length > 0) {
      const barcode = queueRef.current.shift()!
      setQueueSize(queueRef.current.length)

      try {
        const [{ data: participant }, { data: prevLogs }] = await Promise.all([
          supabase.from('participants').select('*').eq('event_id', id).eq('barcode', barcode).single(),
          supabase.from('scan_logs').select('scan_type').eq('event_id', id).eq('barcode', barcode)
            .order('scanned_at', { ascending: false }).limit(1),
        ])

        let scan_type: ScanType = '입장'
        if (prevLogs && prevLogs.length > 0) {
          const lastType = prevLogs[0].scan_type as ScanType
          scan_type = (lastType === '입장' || lastType === '재입장') ? '퇴장' : '재입장'
        }

        const { data: newLog } = await supabase
          .from('scan_logs')
          .insert({ event_id: id, barcode, scan_type })
          .select()
          .single()

        const result: ScanResult = {
          barcode,
          name: participant?.name || '미등록 참가자',
          organization: participant?.organization || '',
          scan_type,
          scanned_at: newLog?.scanned_at || new Date().toISOString(),
          found: !!participant,
        }

        setLastResult(result)
        setRecentResults(prev => [result, ...prev.slice(0, 9)])
      } catch {
        // 개별 스캔 실패 시 다음으로 진행
      }
    }

    processingRef.current = false
    setIsProcessing(false)
    setQueueSize(0)
    inputRef.current?.focus()
  }, [id])

  // 바코드를 큐에 추가하고 처리 시작
  const enqueue = useCallback((barcode: string) => {
    const trimmed = barcode.trim()
    if (!trimmed) return
    queueRef.current.push(trimmed)
    setQueueSize(queueRef.current.length)
    setInputValue('')
    processQueue()
  }, [processQueue])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputValue(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim()) {
      debounceRef.current = setTimeout(() => enqueue(val), 150)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      enqueue(inputValue)
    }
  }

  const scanTypeStyle: Record<ScanType, string> = {
    '입장': 'bg-green-600',
    '퇴장': 'bg-red-600',
    '재입장': 'bg-blue-600',
  }

  const cardBg: Record<ScanType, string> = {
    '입장': 'bg-green-50 border-green-300',
    '퇴장': 'bg-red-50 border-red-300',
    '재입장': 'bg-blue-50 border-blue-300',
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
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">바코드 스캔</label>
          {(isProcessing || queueSize > 0) && (
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
              {queueSize > 0 ? `대기 ${queueSize}명` : '처리 중...'}
            </span>
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="바코드를 스캔하세요..."
          autoComplete="off"
        />
        <p className="text-xs text-gray-400 mt-2">USB 바코드 스캐너로 스캔하면 자동 처리됩니다.</p>
      </div>

      {/* 마지막 스캔 결과 */}
      {lastResult && (
        <div className={`rounded-xl border-2 p-5 mb-4 ${!lastResult.found ? 'bg-yellow-50 border-yellow-300' : cardBg[lastResult.scan_type]}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-2xl font-bold text-gray-900">{lastResult.name}</div>
              {lastResult.organization && (
                <div className="text-sm text-gray-600 mt-0.5">{lastResult.organization}</div>
              )}
              <div className="text-xs text-gray-400 mt-1">{lastResult.barcode}</div>
            </div>
            <div className={`text-lg font-bold px-3 py-1 rounded-full text-white ${scanTypeStyle[lastResult.scan_type]}`}>
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
