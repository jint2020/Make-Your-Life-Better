import { wrap, type Remote } from 'comlink'

/**
 * Worker 客户端：懒创建、可终止、崩溃后自动重建。
 *
 * 用法：
 *   const client = createWorkerClient<Api>(() => new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' }))
 *   await client.api().someMethod()
 */
export interface WorkerClient<T> {
  api(): Remote<T>
  terminate(): void
}

export function createWorkerClient<T>(factory: () => Worker): WorkerClient<T> {
  let worker: Worker | null = null
  let remote: Remote<T> | null = null

  const terminate = () => {
    worker?.terminate()
    worker = null
    remote = null
  }

  return {
    api() {
      if (!remote) {
        worker = factory()
        // 内存不够等原因导致 Worker 崩溃时，下次调用重新创建
        worker.addEventListener('error', terminate)
        remote = wrap<T>(worker)
      }
      return remote
    },
    terminate,
  }
}
