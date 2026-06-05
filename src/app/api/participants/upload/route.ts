import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const event_id = formData.get('event_id') as string

    if (!file || !event_id) {
      return NextResponse.json({ error: '파일과 행사 ID가 필요합니다.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })

    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return NextResponse.json({ error: '시트를 찾을 수 없습니다.' }, { status: 400 })
    }

    // 시트를 2차원 배열로 변환
    const sheet = workbook.Sheets[sheetName]
    const data: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

    // 헤더 행 찾기 (번호/이름/소속/바코드)
    let headerRowIdx = -1
    let colMap: Record<string, number> = {}

    for (let i = 0; i < Math.min(5, data.length); i++) {
      const headers = data[i].map(v => String(v || '').trim())
      const numIdx = headers.findIndex(h => h === '번호')
      const nameIdx = headers.findIndex(h => h === '이름')
      const orgIdx = headers.findIndex(h => ['소속', '기관'].includes(h))
      const barcodeIdx = headers.findIndex(h => h === '바코드')

      if (numIdx >= 0 && nameIdx >= 0 && barcodeIdx >= 0) {
        headerRowIdx = i
        colMap = { number: numIdx, name: nameIdx, org: orgIdx, barcode: barcodeIdx }
        break
      }
    }

    if (headerRowIdx < 0 || !colMap.barcode) {
      return NextResponse.json({ error: '헤더를 찾을 수 없습니다. 번호/이름/소속/바코드 열이 있어야 합니다.' }, { status: 400 })
    }

    const rows: { event_id: string; number: number; name: string; organization: string; barcode: string }[] = []

    for (let i = headerRowIdx + 1; i < data.length; i++) {
      const row = data[i]
      const barcode = String(row[colMap.barcode] || '').trim()
      const name = String(row[colMap.name] || '').trim()
      if (!barcode || !name) continue

      rows.push({
        event_id,
        number: Number(row[colMap.number]) || i - headerRowIdx,
        name,
        organization: colMap.org >= 0 ? String(row[colMap.org] || '').trim() : '',
        barcode,
      })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: '유효한 데이터가 없습니다.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('participants')
      .upsert(rows, { onConflict: 'event_id,barcode' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ count: rows.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
