import { createWorkerClient } from '@/shared/worker/createWorkerClient'
import type { CompareWorkerApi } from './compare.worker'

export const compareWorker = createWorkerClient<CompareWorkerApi>(
  () => new Worker(new URL('./compare.worker.ts', import.meta.url), { type: 'module', name: 'excel-compare' }),
)
