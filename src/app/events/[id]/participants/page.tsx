'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Participant, ScanLog, ScanType } from '@/types'

const emptyForm = { number: '', name: '', organization: '', barcode: '' }

interface ParticipantRow extends Participant {
  status: '내부' | '외부' | '미입장'
  first_entry: string | null
  last_exit: string | null
  inside_minutes: number
  outside_minutes: number
  scan_count: number
}

function calcStats(pLogs: ScanLog[]) {
  let inside_ms = 0
  let outside_ms = 0
  let entry_time: Date | null = null

  for (let i = 0; i < pLogs.length; i++) {
    const t = new Date(pLogs[i].scanned_at)
    if (pLogs[i].scan_type === '입장' || pLogs[i].scan_type === '재입장') {
      entry_time = t
      if (i > 0 && pLogs[i - 1].scan_type === '퇴장') {
        outside_ms += t.getTime() - new Date(pLogs[i - 1].scanned_at).getTime()
      }
    } else if (pLogs[i].scan_type === '퇴장' && entry_time) {
      inside_ms += t.getTime() - entry_time.getTime()
      entry_time = null
    }
  }

  const lastLog = pLogs[pLogs.length - 1]
  const status: '내부' | '외부' = (lastLog.scan_type === '입장' || lastLog.scan_type === '재입장') ? '내부' : '외부'
  return {
    status,
    first_entry: pLogs.find(l => l.scan_type === '입장')?.scanned_at || null,
    last_exit: [...pLogs].reverse().find(l => l.scan_type === '퇴장')?.scanned_at || null,
    inside_minutes: Math.round(inside_ms / 60000),
    outside_minutes: Math.round(outside_ms / 60000),
    scan_count: pLogs.length,
  }
}

function minutesToHHMM(m: number) {
  const h = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}시간 ${min}분` : `${min}분`
}

export default function ParticipantsPage() {
  const { id } = useParams<{ id: string }>()
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [rows, setRows] = useState<ParticipantRow[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const loadData = useCallback(async () => {
    const [pRes, lRes] = await Promise.all([
      supabase.from('participants').select('*').eq('event_id', id).order('number'),
      supabase.from('scan_logs').select('*').eq('event_id', id).order('scanned_at', { ascending: true }),
    ])
    const pList: Participant[] = pRes.data || []
    const logs: ScanLog[] = lRes.data || []
    setParticipants(pList)

    const computed: ParticipantRow[] = pList.map(p => {
      const pLogs = logs.filter(l => l.barcode === p.barcode)
      if (pLogs.length === 0) {
        return { ...p, status: '미입장', first_entry: null, last_exit: null, inside_minutes: 0, outside_minutes: 0, scan_count: 0 }
      }
      return { ...p, ...calcStats(pLogs) }
    })
    setRows(computed)
    setLoading(false)
  }, [id])

  useEffect(() => {
    supabase.from('events').select('name,date').eq('id', id).single().then(({ data }) => {
      if (data) { setEventName(data.name); setEventDate(data.date) }
    })
    loadData()
  }, [id, loadData])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadMsg('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('event_id', id)
      const res = await fetch('/api/participants/upload', { method: 'POST', body: formData })
      const result = await res.json()
      if (res.ok) {
        setUploadMsg(`✓ ${result.count}명 업로드 완료`)
        loadData()
      } else {
        setUploadMsg(`오류: ${result.error}`)
      }
    } catch {
      setUploadMsg('업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.barcode) return
    setSaving(true)
    const payload = {
      event_id: id,
      number: Number(form.number) || participants.length + 1,
      name: form.name.trim(),
      organization: form.organization.trim(),
      barcode: form.barcode.trim(),
    }
    if (editId) {
      await supabase.from('participants').update(payload).eq('id', editId)
    } else {
      await supabase.from('participants').upsert(payload, { onConflict: 'event_id,barcode' })
    }
    setSaving(false)
    setForm(emptyForm)
    setShowAddForm(false)
    setEditId(null)
    loadData()
  }

  function startEdit(p: Participant) {
    setForm({ number: String(p.number), name: p.name, organization: p.organization, barcode: p.barcode })
    setEditId(p.id)
    setShowAddForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelForm() {
    setForm(emptyForm)
    setShowAddForm(false)
    setEditId(null)
  }

  async function deleteParticipant(pid: string) {
    if (!confirm('이 참가자를 삭제하시겠습니까?')) return
    await supabase.from('participants').delete().eq('id', pid)
    loadData()
  }

  async function clearParticipants() {
    if (!confirm('참가자 명단을 모두 삭제하시겠습니까?')) return
    await supabase.from('participants').delete().eq('event_id', id)
    loadData()
  }

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

  const fmtTime = (dt: string | null) =>
    dt ? new Date(dt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/events/${id}`} className="text-sm text-gray-500 hover:text-gray-700">← 대시보드</Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">참가자 명단</h1>
          <p className="text-sm text-gray-500 mt-0.5">{eventName}{eventDate && <span className="ml-2 text-gray-400">· {eventDate}</span>}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{participants.length}명</span>
          <button
            onClick={loadData}
            className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50"
          >
            새로고침
          </button>
          <button
            onClick={downloadExcel}
            disabled={downloading}
            className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 font-medium"
          >
            {downloading ? '다운로드 중...' : '엑셀 다운로드'}
          </button>
          <button
            onClick={() => { setShowAddForm(true); setEditId(null); setForm(emptyForm) }}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 font-medium"
          >
            + 개별 추가
          </button>
        </div>
      </div>

      {/* 개별 추가/수정 폼 */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border-2 border-blue-200 p-5 mb-6">
          <h2 className="font-medium text-gray-800 mb-4">{editId ? '참가자 수정' : '참가자 개별 추가'}</h2>
          <form onSubmit={handleSave} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">번호</label>
              <input
                type="number"
                value={form.number}
                onChange={e => setForm({ ...form, number: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="자동"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">이름 *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="홍길동"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">소속</label>
              <input
                type="text"
                value={form.organization}
                onChange={e => setForm({ ...form, organization: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="강남의원"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">바코드 *</label>
              <input
                type="text"
                required
                value={form.barcode}
                onChange={e => setForm({ ...form, barcode: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="20260000000001"
              />
            </div>
            <div className="col-span-2 flex gap-2 pt-1">
              <button type="button" onClick={cancelForm} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
                취소
              </button>
              <button type="submit" disabled={saving} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? '저장 중...' : editId ? '수정 완료' : '추가'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 엑셀 업로드 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
        <h2 className="font-medium text-gray-800 mb-3">엑셀 업로드</h2>
        <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs text-gray-600">
          <p className="font-medium mb-1">엑셀 파일 형식 (헤더 필수)</p>
          <p>번호 | 이름 | 소속 | 바코드</p>
          <p className="mt-1 text-gray-400">기존 명단은 유지되고 새 데이터가 추가됩니다 (바코드 중복 시 덮어씀).</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            disabled={uploading}
            className="text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm file:cursor-pointer hover:file:bg-blue-700"
          />
          {uploading && <span className="text-sm text-gray-500">업로드 중...</span>}
          {uploadMsg && (
            <span className={`text-sm ${uploadMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>
              {uploadMsg}
            </span>
          )}
        </div>
      </div>

      {/* 참가자 목록 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-medium text-gray-800">명단</h2>
          {participants.length > 0 && (
            <button onClick={clearParticipants} className="text-xs text-red-500 hover:text-red-700">
              전체 삭제
            </button>
          )}
        </div>
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">로딩 중...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">명단이 없습니다. 개별 추가하거나 엑셀을 업로드하세요.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">번호</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">이름</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">소속</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">현재상태</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">최초입장</th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">최종퇴장</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">내부체류</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">외부체류</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">스캔</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500">{r.number}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{r.name}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{r.organization}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{fmtTime(r.first_entry)}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{fmtTime(r.last_exit)}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-700 text-xs">
                      {r.status === '미입장' ? '-' : minutesToHHMM(r.inside_minutes)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 text-xs">
                      {r.status === '미입장' ? '-' : minutesToHHMM(r.outside_minutes)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400 text-xs">{r.scan_count}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(r)} className="text-xs text-blue-500 hover:text-blue-700 mr-2">수정</button>
                      <button onClick={() => deleteParticipant(r.id)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
