import type { CorpusPayload, DemoPayload, Question, Run, Trial } from './types'

export const emptyCorpus: CorpusPayload = {
  questions: [],
  papers: [],
  edges: [],
  coverage: { note: 'The public corpus has not been loaded yet.' },
}

export async function loadCorpus(): Promise<CorpusPayload> {
  const local = await fetch('/data/corpus.json').then((r) => r.ok ? r.json() : null).catch(() => null)
  const remote = await fetch('/api/questions').then((r) => r.ok ? r.json() : null).catch(() => null)
  const candidate = remote?.questions?.length ? remote : local
  if (!candidate || !Array.isArray(candidate.questions)) return emptyCorpus
  return { ...emptyCorpus, ...candidate }
}

export async function loadDemo(): Promise<DemoPayload> {
  const local = await fetch('/data/demo-run.json').then((r) => r.ok ? r.json() : null).catch(() => null)
  return local && typeof local === 'object' ? local : {}
}

export function findQuestion(corpus: CorpusPayload, id?: string): Question | undefined {
  return corpus.questions.find((q) => q.id === id)
}

export function asRun(value: unknown): Run | undefined {
  if (!value || typeof value !== 'object') return undefined
  const run = value as Partial<Run>
  return typeof run.id === 'string' && typeof run.status === 'string' ? run as Run : undefined
}

export function asTrials(value: unknown): Trial[] {
  return Array.isArray(value) ? value.filter((trial): trial is Trial => !!trial && typeof trial === 'object' && typeof trial.id === 'string') : []
}
