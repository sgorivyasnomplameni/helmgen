import type { ChartConfig } from '@/types/generator'

const name = (c: ChartConfig) => c.appName || 'myapp'

export function generateDeploymentYaml(c: ChartConfig): string {
  const n = name(c)
  const replicasLine = c.workloadType !== 'DaemonSet'
    ? `  replicas: {{ .Values.replicaCount }}\n`
    : ''

  const resourcesBlock = c.resources.enabled
    ? `          resources:
            requests:
              cpu: {{ .Values.resources.requests.cpu }}
              memory: {{ .Values.resources.requests.memory }}
            limits:
              cpu: {{ .Values.resources.limits.cpu }}
              memory: {{ .Values.resources.limits.memory }}`
    : `          resources: {}`

  return `apiVersion: apps/v1
kind: ${c.workloadType}
metadata:
  name: {{ include "${n}.fullname" . }}
  labels:
    {{- include "${n}.labels" . | nindent 4 }}
spec:
${replicasLine}  selector:
    matchLabels:
      {{- include "${n}.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "${n}.selectorLabels" . | nindent 8 }}
    spec:
      hostNetwork: {{ .Values.hostNetwork | default false }}
      {{- with .Values.podSecurityContext }}
      securityContext:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          {{- with .Values.containerSecurityContext }}
          securityContext:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          ports:
            - name: http
              containerPort: {{ .Values.containerPort }}
              protocol: TCP
${resourcesBlock}`
}

export function generateServiceYaml(c: ChartConfig): string {
  if (!c.service.enabled) return '# Service отключён'
  const n = name(c)
  return `apiVersion: v1
kind: Service
metadata:
  name: {{ include "${n}.fullname" . }}
  labels:
    {{- include "${n}.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "${n}.selectorLabels" . | nindent 4 }}`
}

export function generateIngressYaml(c: ChartConfig): string {
  if (!c.ingress.enabled) return '# Ingress отключён'
  const n = name(c)
  return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "${n}.fullname" . }}
  labels:
    {{- include "${n}.labels" . | nindent 4 }}
spec:
  rules:
    - host: {{ .Values.ingress.host | quote }}
      http:
        paths:
          - path: {{ .Values.ingress.path }}
            pathType: Prefix
            backend:
              service:
                name: {{ include "${n}.fullname" . }}
                port:
                  number: {{ .Values.service.port }}`
}

export function generateValuesYaml(c: ChartConfig): string {
  const lines: string[] = []

  lines.push('workload:')
  lines.push(`  type: ${c.workloadType}`)
  lines.push('')
  lines.push(`replicaCount: ${c.workloadType === 'DaemonSet' ? 1 : c.replicas}`)
  lines.push('')
  lines.push('image:')
  lines.push(`  repository: ${c.image || 'nginx'}`)
  lines.push('  pullPolicy: IfNotPresent')
  lines.push(`  tag: "${c.imageTag || 'latest'}"`)
  lines.push('')
  lines.push(`containerPort: ${c.containerPort}`)

  if (c.service.enabled) {
    lines.push('')
    lines.push('service:')
    lines.push('  enabled: true')
    lines.push(`  type: ${c.service.type}`)
    lines.push(`  port: ${c.service.port}`)
  } else {
    lines.push('')
    lines.push('service:')
    lines.push('  enabled: false')
    lines.push('  type: ClusterIP')
    lines.push(`  port: ${c.service.port}`)
  }

  lines.push('')
  lines.push('ingress:')
  lines.push(`  enabled: ${c.ingress.enabled ? 'true' : 'false'}`)
  if (c.ingress.enabled) {
    lines.push(`  host: "${c.ingress.host}"`)
    lines.push(`  path: "${c.ingress.path}"`)
  }

  lines.push('')
  if (c.resources.enabled) {
    lines.push('resources:')
    lines.push('  requests:')
    lines.push(`    cpu: ${c.resources.requests.cpu}`)
    lines.push(`    memory: ${c.resources.requests.memory}`)
    lines.push('  limits:')
    lines.push(`    cpu: ${c.resources.limits.cpu}`)
    lines.push(`    memory: ${c.resources.limits.memory}`)
  } else {
    lines.push('resources: {}')
  }

  lines.push('')
  lines.push(`hostNetwork: ${c.security.hostNetwork ? 'true' : 'false'}`)
  lines.push('')
  lines.push('podSecurityContext:')
  lines.push(`  runAsNonRoot: ${c.security.podSecurityContext.runAsNonRoot ? 'true' : 'false'}`)
  lines.push('')
  lines.push('containerSecurityContext:')
  lines.push(`  privileged: ${c.security.containerSecurityContext.privileged ? 'true' : 'false'}`)
  lines.push(`  allowPrivilegeEscalation: ${c.security.containerSecurityContext.allowPrivilegeEscalation ? 'true' : 'false'}`)
  lines.push(`  readOnlyRootFilesystem: ${c.security.containerSecurityContext.readOnlyRootFilesystem ? 'true' : 'false'}`)
  lines.push('  capabilities:')
  if (c.security.containerSecurityContext.capabilitiesDropAll) {
    lines.push('    drop:')
    lines.push('      - ALL')
  } else {
    lines.push('    drop: []')
  }

  return lines.join('\n')
}

export function generateChartYaml(c: ChartConfig): string {
  return `apiVersion: v2
name: ${name(c)}
description: A Helm chart for ${name(c)}
type: application
version: ${c.version || '0.1.0'}
appVersion: "${c.imageTag || 'latest'}"`
}
