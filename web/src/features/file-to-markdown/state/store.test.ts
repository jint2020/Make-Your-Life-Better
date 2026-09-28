import { beforeEach, describe, expect, it, vi } from 'vitest'

import { convertFile, type ConvertOutcome } from '../api'
import { __resetFileToMarkdownForTests, useFileToMarkdownStore } from './store'

vi.mock('../api', () => ({ convertFile: vi.fn() }))

const mockConvert = vi.mocked(convertFile)

function makeFile(name: string, size?: number): File {
  return size == null ? new File(['hello'], name) : new File([new Uint8Array(size)], name)
}

/** 用真实的宏任务轮询状态，而不是猜测要 await 几次 Promise.resolve()：更贴近队列内部真实的微任务链长度 */
async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('等待超时')
    await new Promise((r) => setTimeout(r, 0))
  }
}

/** 一个手动控制何时 resolve 的 convertFile 结果 */
function deferred() {
  let resolve!: (v: ConvertOutcome) => void
  const promise = new Promise<ConvertOutcome>((r) => (resolve = r))
  return { promise, resolve }
}

function itemOf(id: string) {
  return useFileToMarkdownStore.getState().items.find((i) => i.id === id)
}

beforeEach(() => {
  useFileToMarkdownStore.setState({ items: [], selectedId: null, notice: null })
  __resetFileToMarkdownForTests()
  mockConvert.mockReset()
})

describe('addFiles：校验', () => {
  it('不支持的扩展名直接失败，不会调用转换接口', () => {
    useFileToMarkdownStore.getState().addFiles([makeFile('a.zip')])
    expect(useFileToMarkdownStore.getState().items[0]).toMatchObject({ status: 'failed' })
    expect(mockConvert).not.toHaveBeenCalled()
  })

  it('.doc 提示另存为 .docx', () => {
    useFileToMarkdownStore.getState().addFiles([makeFile('old.doc')])
    expect(useFileToMarkdownStore.getState().items[0]?.error).toContain('.docx')
  })

  it('超过 20MB 直接失败', () => {
    useFileToMarkdownStore.getState().addFiles([makeFile('big.pdf', 21 * 1024 * 1024)])
    expect(useFileToMarkdownStore.getState().items[0]).toMatchObject({ status: 'failed' })
    expect(mockConvert).not.toHaveBeenCalled()
  })

  it('超过 10 个文件：只加入前 10 个，其余给出提示', () => {
    mockConvert.mockReturnValue(new Promise(() => {}))
    const incoming = Array.from({ length: 12 }, (_, i) => makeFile(`f${i}.pdf`))
    useFileToMarkdownStore.getState().addFiles(incoming)
    expect(useFileToMarkdownStore.getState().items).toHaveLength(10)
    expect(useFileToMarkdownStore.getState().notice).toContain('2')
  })

  it('第一次加入文件时自动选中第一个', () => {
    mockConvert.mockReturnValue(new Promise(() => {}))
    useFileToMarkdownStore.getState().addFiles([makeFile('a.pdf'), makeFile('b.pdf')])
    expect(useFileToMarkdownStore.getState().selectedId).toBe(useFileToMarkdownStore.getState().items[0]!.id)
  })
})

describe('队列处理：一次只转一个', () => {
  it('转换成功后状态变成完成，并算出字符数和 Token 数', async () => {
    const gate = deferred()
    mockConvert.mockReturnValue(gate.promise)
    useFileToMarkdownStore.getState().addFiles([makeFile('a.pdf')])
    const id = useFileToMarkdownStore.getState().items[0]!.id
    await waitFor(() => itemOf(id)?.status === 'converting')

    gate.resolve({ ok: true, value: { markdown: '中文abc', warnings: ['table_truncated'] } })
    await waitFor(() => itemOf(id)?.status === 'done')
    expect(itemOf(id)).toMatchObject({
      markdown: '中文abc',
      warnings: ['table_truncated'],
      charCount: 5,
      tokenCount: 3, // 中文 2 个 + ceil(3/4)=1
    })
  })

  it('两个文件依次处理：第二个要等第一个结束才开始', async () => {
    const gates = [deferred(), deferred()]
    mockConvert.mockReturnValueOnce(gates[0]!.promise).mockReturnValueOnce(gates[1]!.promise)
    useFileToMarkdownStore.getState().addFiles([makeFile('a.pdf'), makeFile('b.pdf')])
    const [idA, idB] = useFileToMarkdownStore.getState().items.map((i) => i.id) as [string, string]

    await waitFor(() => itemOf(idA)?.status === 'converting')
    expect(itemOf(idB)?.status).toBe('queued')
    expect(mockConvert).toHaveBeenCalledTimes(1)

    gates[0]!.resolve({ ok: true, value: { markdown: 'A', warnings: [] } })
    await waitFor(() => itemOf(idB)?.status === 'converting')
    expect(itemOf(idA)?.status).toBe('done')
    expect(mockConvert).toHaveBeenCalledTimes(2)

    gates[1]!.resolve({ ok: true, value: { markdown: 'B', warnings: [] } })
    await waitFor(() => itemOf(idB)?.status === 'done')
  })

  it('转换失败：状态变成失败，带上错误信息', async () => {
    mockConvert.mockResolvedValue({ ok: false, message: '服务器繁忙，请稍后再试。' })
    useFileToMarkdownStore.getState().addFiles([makeFile('a.pdf')])
    const id = useFileToMarkdownStore.getState().items[0]!.id
    await waitFor(() => itemOf(id)?.status === 'failed')
    expect(itemOf(id)?.error).toBe('服务器繁忙，请稍后再试。')
  })
})

describe('removeItem', () => {
  it('移除正在转换的文件会中止请求（signal.aborted 变 true）', async () => {
    let signalSeen: AbortSignal | undefined
    mockConvert.mockImplementation(
      (_file, signal) =>
        new Promise((resolve) => {
          signalSeen = signal
          signal.addEventListener('abort', () => resolve({ ok: false, message: '已取消' }))
        }),
    )
    useFileToMarkdownStore.getState().addFiles([makeFile('a.pdf')])
    const id = useFileToMarkdownStore.getState().items[0]!.id
    await waitFor(() => itemOf(id)?.status === 'converting')

    useFileToMarkdownStore.getState().removeItem(id)
    expect(signalSeen?.aborted).toBe(true)
    expect(useFileToMarkdownStore.getState().items).toHaveLength(0)
  })

  it('移除选中项后自动选中剩下的第一个', () => {
    mockConvert.mockReturnValue(new Promise(() => {}))
    useFileToMarkdownStore.getState().addFiles([makeFile('a.pdf'), makeFile('b.pdf')])
    const [idA, idB] = useFileToMarkdownStore.getState().items.map((i) => i.id)
    useFileToMarkdownStore.getState().select(idA!)
    useFileToMarkdownStore.getState().removeItem(idA!)
    expect(useFileToMarkdownStore.getState().selectedId).toBe(idB)
  })

  it('移除不影响其他排队项：处理完当前项后继续处理剩下的', async () => {
    const gate = deferred()
    mockConvert.mockReturnValueOnce(gate.promise).mockResolvedValueOnce({ ok: true, value: { markdown: 'C', warnings: [] } })
    useFileToMarkdownStore.getState().addFiles([makeFile('a.pdf'), makeFile('b.pdf'), makeFile('c.pdf')])
    const [, idB, idC] = useFileToMarkdownStore.getState().items.map((i) => i.id)
    await waitFor(() => itemOf(idB!)?.status !== undefined)

    useFileToMarkdownStore.getState().removeItem(idB!)
    gate.resolve({ ok: true, value: { markdown: 'B', warnings: [] } }) // 这个条目已经被移除，结果如何都无所谓，只关心队列能继续
    await waitFor(() => itemOf(idC!)?.status === 'done')
  })
})

describe('retryItem', () => {
  it('失败后重试会重新调用转换接口，可以转换成功', async () => {
    mockConvert.mockResolvedValueOnce({ ok: false, message: '服务器繁忙' })
    useFileToMarkdownStore.getState().addFiles([makeFile('a.pdf')])
    const id = useFileToMarkdownStore.getState().items[0]!.id
    await waitFor(() => itemOf(id)?.status === 'failed')

    mockConvert.mockResolvedValueOnce({ ok: true, value: { markdown: '好了', warnings: [] } })
    useFileToMarkdownStore.getState().retryItem(id)
    await waitFor(() => itemOf(id)?.status === 'done')
    expect(itemOf(id)?.markdown).toBe('好了')
  })

  it('重试校验失败的项（比如太大）：还是失败，不会调用接口', () => {
    useFileToMarkdownStore.getState().addFiles([makeFile('big.pdf', 21 * 1024 * 1024)])
    const id = useFileToMarkdownStore.getState().items[0]!.id
    useFileToMarkdownStore.getState().retryItem(id)
    expect(itemOf(id)?.status).toBe('failed')
    expect(mockConvert).not.toHaveBeenCalled()
  })
})
