export type QuestionStatus = 'Unassessed' | 'Apparently open' | 'Partially addressed' | 'Contested' | 'Addressed under stated conditions'

export interface Paper {
  id: string
  title: string
  authors: string[]
  published: string
  updated?: string
  url: string
  version?: string
  sourceType?: string
  abstract?: string
  topics?: string[]
  verificationStatus?: string
  featured?: boolean
}

export interface Question {
  id: string
  title: string
  area: string
  status: QuestionStatus | string
  origin: 'author-stated' | 'agent-proposed' | string
  summary: string
  whyItMatters: string
  source: { paperId: string; url: string; version?: string; section?: string; passage?: string }
  closestWork: { paperId: string; finding: string; mismatch: string }[]
  uncertainty: string
  search: { date?: string; queries?: string[]; coverage?: string; inaccessible?: string[] }
  executable: boolean
  estimatedCostUsd?: number
  estimatedMinutes?: number
  access?: string
  position?: { x: number; y: number }
  evidenceIds?: string[]
}

export interface Edge { id: string; source: string; target: string; type: string; explanation: string; evidenceUrl?: string }

export interface Trial {
  id: string; runId: string; caseId: string; condition: string; status: string; input?: unknown; output?: unknown; answer?: string; expectedAnswer?: string
  score?: number; monitorVerdict?: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; costUsd?: number
  createdAt?: string; completedAt?: string; provider?: string; model?: string; metadata?: Record<string, unknown>
}

export interface Run {
  id: string; questionId: string; contractId: string; contractHash: string; status: string; createdAt?: string; startedAt?: string; completedAt?: string
  capUsd: number; spentUsd: number; costStatus: string; completedTrials: number; totalTrials: number; failedTrials: number
  conditions?: { id?: string; label: string; description?: string; color?: string }[]; summary?: {
    headline?: string; conclusion?: string; primaryOutcome?: string; uncertainty?: string; limitations?: string[]; observations?: string[]
  }; artifactUrl?: string; events?: { at?: string; label: string; detail?: string; type?: string }[]
}

export interface CorpusPayload { questions: Question[]; papers: Paper[]; edges: Edge[]; coverage?: { searchedAt?: string; paperCount?: number; questionCount?: number; note?: string } }
export interface DemoPayload { run?: Run; trials?: Trial[]; contract?: Record<string, unknown> }

