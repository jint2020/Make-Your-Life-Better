/** 队列相关的纯逻辑：数量上限、移除后该选中谁、下一个待处理项、下载文件名 */

export const MAX_FILES = 10

/** 这一批新增的文件里有多少个能真正加入列表（受最多 10 个的限制），剩下多少个放不下 */
export function splitByRoom<F>(
  incoming: F[],
  currentCount: number,
  max: number = MAX_FILES,
): { accepted: F[]; overflow: number } {
  const room = Math.max(0, max - currentCount)
  const accepted = incoming.slice(0, room)
  return { accepted, overflow: incoming.length - accepted.length }
}

/** 移除一个条目后，右侧该显示哪一个：被移除的正好是选中的，就换成剩下的第一个；否则不变 */
export function selectionAfterRemove<T extends { id: string }>(
  remaining: T[],
  removedId: string,
  selectedId: string | null,
): string | null {
  if (selectedId !== removedId) return selectedId
  return remaining[0]?.id ?? null
}

/** 队列里下一个该处理的条目：排在最前面的"排队中" */
export function nextQueued<T extends { status: string }>(items: T[]): T | undefined {
  return items.find((i) => i.status === 'queued')
}

/** 下载文件名：原文件名去掉扩展名后加 .md，中文名原样保留 */
export function markdownFileName(originalName: string): string {
  const i = originalName.lastIndexOf('.')
  const base = i <= 0 ? originalName : originalName.slice(0, i)
  return `${base}.md`
}
