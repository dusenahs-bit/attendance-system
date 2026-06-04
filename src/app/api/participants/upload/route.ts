import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

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
    const workbook = new ExcelJS.Workbook()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(arrayBuffer as any)

    const worksheet = workbook.worksheets[0]
    if (!worksheet) {
      return NextResponse.json({ error: '시트를 찾을 수 없습니다.' }, { status: 400 })
    }

    // 헤더 행 파악 (번호/이름/소속/바코드 컬럼 위치 찾기)
    let headerRow = 1
    let colMap: Record<string, number> = {}

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 5) return
      const values = row.values as (string | number | null)[]
      const headers = values.map(v => String(v || '').trim())

      const numIdx = headers.findIndex(h => h === '번호')
      const nameIdx = headers.findIndex(h => h === '이름')
      const orgIdx = headers.findIndex(h => ['소속', '기관'].includes(h))
      const barcodeIdx = headers.findIndex(h => h === '바코드')

      if (numIdx > 0 && nameIdx > 0 && barcodeIdx > 0) {
        headerRow = rowNumber
        colMap = { number: numIdx, name: nameIdx, org: orgIdx, barcode: barcodeIdx }
      }
    })

    if (!colMap.barcode) {
      return NextResponse.json({ error: '헤더를 찾을 수 없습니다. 번호/이름/소속/바코드 열이 있어야 합니다.' }, { status: 400 })
    }

    const rows: { event_id: string; number: number; name: string; organization: string; barcode: string }[] = []

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRow) return
      const values = row.values as (string | number | null)[]
      const barcode = String(values[colMap.barcode] || '').trim()
      const name = String(values[colMap.name] || '').trim()
      if (!barcode || !name) return

      rows.push({
        event_id,
        number: Number(values[colMap.number]) || rowNumber - headerRow,
        name,
        organization: colMap.org > 0 ? String(values[colMap.org] || '').trim() : '',
        barcode,
      })
    })

    if (rows.length === 0) {
      return NextResponse.json({ error: '유효한 데이터가 없습니다.' }, { status: 400 })
    }

    // upsert (바코드 중복 시 덮어씀)
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
