'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Event } from '@/types'

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', date: '', location: '' })
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadEvents()
  }, [])

  async function loadEvents() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: false })
    setEvents(data || [])
    setLoading(false)
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('events').insert(form)
    if (error) {
      alert('저장 오류: ' + error.message)
      setSaving(false)
      return
    }
    setForm({ name: '', date: '', location: '' })
    setShowForm(false)
    setSaving(false)
    loadEvents()
  }

  async function deleteEvent(id: string) {
    if (!confirm('행사를 삭제하면 참가자 및 스캔 기록이 모두 삭제됩니다. 계속하시겠습니까?')) return
    await supabase.from('events').delete().eq('id', id)
    loadEvents()
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">출입 관리 시스템</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          + 행사 등록
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-bold mb-4">새 행사 등록</h2>
            <form onSubmit={createEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">행사명 *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="예: 파마리서치 ART Symposium"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">날짜 *</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">장소</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="예: 여수 소노캄"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">로딩 중...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">등록된 행사가 없습니다.</p>
          <p className="text-sm mt-1">위의 버튼으로 행사를 등록하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(event => (
            <div key={event.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">{event.name}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {event.date} · {event.location || '장소 미입력'}
                  </p>
                </div>
                <button
                  onClick={() => deleteEvent(event.id)}
                  className="text-gray-400 hover:text-red-500 text-xs px-2 py-1"
                >
                  삭제
                </button>
              </div>
              <div className="flex gap-2 mt-4">
                <Link
                  href={`/events/${event.id}`}
                  className="flex-1 text-center bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-200 font-medium"
                >
                  대시보드
                </Link>
                <Link
                  href={`/events/${event.id}/scan`}
                  className="flex-1 text-center bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700 font-medium"
                >
                  스캔
                </Link>
                <Link
                  href={`/events/${event.id}/participants`}
                  className="flex-1 text-center bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-200 font-medium"
                >
                  참가자
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
