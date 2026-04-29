export type WorkloadType = 'Deployment' | 'StatefulSet' | 'DaemonSet'
export type ServiceType = 'ClusterIP' | 'NodePort' | 'LoadBalancer'
export type YamlTab = 'deployment.yaml' | 'service.yaml' | 'ingress.yaml' | 'Chart.yaml'

export interface ChartConfig {
  appName: string
  version: string
  image: string
  imageTag: string
  replicas: number
  containerPort: number
  workloadType: WorkloadType
  service: {
    enabled: boolean
    port: number
    type: ServiceType
  }
  ingress: {
    enabled: boolean
    host: string
    path: string
  }
  resources: {
    enabled: boolean
    requests: { cpu: string; memory: string }
    limits: { cpu: string; memory: string }
  }
  security: {
    hostNetwork: boolean
    podSecurityContext: {
      runAsNonRoot: boolean
    }
    containerSecurityContext: {
      privileged: boolean
      allowPrivilegeEscalation: boolean
      readOnlyRootFilesystem: boolean
      capabilitiesDropAll: boolean
    }
  }
}
