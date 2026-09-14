export type StudyStatus = {
  status: 'preparing' | 'queued' | 'running' | 'completed' | 'failed' | 'incomplete';
  phase: string; completed: number; total: number; updatedAt: string; message: string;
  telemetry: 'kaggle-status' | 'notebook-log'; notebookUrl: string; artifactUrl: string;
};
export function validateStudyStatus(value: unknown): StudyStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!['preparing','queued','running','completed','failed','incomplete'].includes(String(v.status))) return null;
  if (typeof v.phase !== 'string' || !/^[a-z-]{1,80}$/.test(v.phase)) return null;
  if (!Number.isInteger(v.completed) || !Number.isInteger(v.total) || Number(v.completed) < 0 || Number(v.total) < 0 || Number(v.completed) > Number(v.total) || Number(v.total) > 50000) return null;
  if (typeof v.message !== 'string' || v.message.length > 1200 || typeof v.updatedAt !== 'string' || !Number.isFinite(Date.parse(v.updatedAt))) return null;
  if (v.telemetry !== 'kaggle-status' && v.telemetry !== 'notebook-log') return null;
  return { status: v.status as StudyStatus['status'], phase: v.phase, completed: Number(v.completed), total: Number(v.total),
    updatedAt: new Date(v.updatedAt).toISOString(), message: v.message, telemetry: v.telemetry,
    notebookUrl: 'https://www.kaggle.com/code/raphaelkhalid0/unsupervisedsaes',
    artifactUrl: 'https://github.com/RaphaelKhalid/afterlight/tree/main/research/persona-discovery' };
}
