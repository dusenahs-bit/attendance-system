'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Participant } from '@/types'

export default function ParticipantsPage() {
  const { id } = useParams<{ id: string }>()
  const [eventName, setEventName] = useState('')
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const loadParticipants = useCallback(async () => {
    const { data } = await supabase
      .from('participants')
      .select('*')
      .eq('event_id', id)
      .order('number')
    setParticipants(data || [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    supabase.from('events').select('name').eq('id', id).single().then(({ data }) => {
      if (data) setEventName(data.name)
    })
    loadParticipants()
  }, [id, loadParticipants])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadMsg('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('event_id', id)

      const res = await fetch('/api/participants/upload', {
        method: 'POST',
        body: formData,
      })
      const result = await res.json()

      if (res.ok) {
        setUploadMsg(`✓ ${result.count}명 업로드 완료`)
        loadParticipants()
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

  async function clearParticipants() {
    if (!confirm('참가자 명단을 모두 삭제하시겠습니까?')) return
    await supabase.from('participants').delete().eq('event_id', id)
    loadParticipants()
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/events/${id}`} className="text-sm text-gray-500 hover:text-gray-700">← 대시보드</Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">참가자 명단</h1>
          <p className="text-sm text-gray-500 mt-0.5">{eventName}</p>
        </div>
        <span className="text-sm text-gray-500">{participants.length}명</span>
      </div>

      {/* 엑셀 업로드 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
        <h2 className="font-medium text-gray-800 mb-3">엑셀 업로드</h2>
        <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs text-gray-600">
          <p className="font-medium mb-1">엑셀 파일 형식 (헤더 필수)</p>
          <p>번호 | 이름 | 소속 | 바코드</p>
          <p className="mt-1 text-gray-400">첫 번째 행이 헤더여야 합니다. 기존 명단은 유지되고 새 데이터가 추가됩니다 (바코드 중복 시 덮어씀).</p>
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
        ) : participants.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">명단이 없습니다. 엑셀 파일을 업로드하세요.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">번호</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">이름</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">소속</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">바코드</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {participants.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500">{p.number}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.organization}</td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{p.barcode}</td>
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
