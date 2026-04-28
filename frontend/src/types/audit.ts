export interface AuditEvent {
  id: number
  user_id: number | null
  chart_id: number | null
  action: string
  entity_type: string
  status: string
  summary: string
  details: string | null
  created_at: string
}
