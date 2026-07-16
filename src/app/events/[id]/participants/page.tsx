'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Participant } from '@/types'

const emptyForm = { number: '', name: '', organization: '', barcode: '' }

export default function ParticipantsPage() {
  const { id } = useParams<{ id: string }>()
  const [eventName, setEventName] = useState('')
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
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
      const res = await fetch('/api/participants/upload', { method: 'POST', body: formData })
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
    loadParticipants()
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
    loadParticipants()
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
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{participants.length}명</span>
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
        ) : participants.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">명단이 없습니다. 개별 추가하거나 엑셀을 업로드하세요.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">번호</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">이름</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">소속</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">바코드</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {participants.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500">{p.number}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.organization}</td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{p.barcode}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => startEdit(p)} className="text-xs text-blue-500 hover:text-blue-700 mr-2">수정</button>
                      <button onClick={() => deleteParticipant(p.id)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
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
