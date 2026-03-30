export interface Chart {
  id: number
  name: string
  description: string | null
  chart_version: string
  app_version: string
  values_yaml: string | null
  generated_yaml: string | null
  created_at: string
  updated_at: string
}

export interface ChartCreate {
  name: string
  description?: string
  chart_version?: string
  app_version?: string
  values_yaml?: string
}

export interface ChartUpdate {
  name?: string
  description?: string
  chart_version?: string
  app_version?: string
  values_yaml?: string
}
