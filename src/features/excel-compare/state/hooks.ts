import { validateFieldRows } from './fields'
import { useCompareStore } from './store'

/** 字段配置合法、且当前没有在对比时，才能点"开始对比" */
export function useCanRunCompare(): boolean {
  const fieldRows = useCompareStore((s) => s.fieldRows)
  const comparing = useCompareStore((s) => s.comparing)
  return !comparing && validateFieldRows(fieldRows).errors.length === 0
}
