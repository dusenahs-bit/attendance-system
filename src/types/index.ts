export interface Event {
  id: string
  name: string
  date: string
  location: string
  created_at: string
}

export interface Participant {
  id: string
  event_id: string
  number: number
  name: string
  organization: string
  barcode: string
  created_at: string
}

export type ScanType = '입장' | '퇴장' | '재입장'

export interface ScanLog {
  id: string
  event_id: string
  barcode: string
  scan_type: ScanType
  scanned_at: string
  participant?: Participant
}

export interface ParticipantStatus {
  participant: Participant
  current_status: '내부' | '외부' | '미입장'
  first_entry: string | null
  last_exit: string | null
  inside_duration_minutes: number
  outside_duration_minutes: number
  scan_count: number
}
