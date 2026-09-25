import type { CustomCellRendererProps } from 'ag-grid-react'

import { RowStatusBadges } from '../components/RowStatusBadges'
import type { CompareResult } from '../engine/types'
import type { RowRef } from './shared'

export function StatusCell({ data, result }: CustomCellRendererProps<RowRef> & { result: CompareResult }) {
  return data ? <RowStatusBadges result={result} i={data.i} showFields /> : null
}
