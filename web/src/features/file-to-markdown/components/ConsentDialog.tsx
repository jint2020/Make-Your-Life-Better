import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { t } from '../copy'

/** 第一次添加文件前的确认弹窗：说明文件会上传到服务器转换，转完就删 */
export function ConsentDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.consent.title}</DialogTitle>
          <DialogDescription className="leading-relaxed">{t.consent.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t.consent.cancel}
          </Button>
          <Button onClick={onConfirm}>{t.consent.confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
