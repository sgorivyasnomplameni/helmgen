export interface Chart {
  id: number
  name: string
  description: string | null
  chart_version: string
  app_version: string
  values_yaml: string | null
  generated_yaml: string | null
  lifecycle_status: string
  validation_status: string | null
  validation_summary: string | null
  validated_at: string | null
  template_status: string | null
  template_summary: string | null
  templated_at: string | null
  dry_run_status: string | null
  dry_run_summary: string | null
  dry_run_output: string | null
  dry_run_release_name: string | null
  dry_run_namespace: string | null
  dry_run_at: string | null
  deploy_status: string | null
  deploy_summary: string | null
  deploy_output: string | null
  deployed_release_name: string | null
  deployed_namespace: string | null
  deployed_at: string | null
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
