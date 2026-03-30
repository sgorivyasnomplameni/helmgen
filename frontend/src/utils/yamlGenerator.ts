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
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
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

export function generateChartYaml(c: ChartConfig): string {
  return `apiVersion: v2
name: ${name(c)}
description: A Helm chart for ${name(c)}
type: application
version: ${c.version || '0.1.0'}
appVersion: "${c.imageTag || 'latest'}"`
}
