import { MonitorIcon, MoonIcon, PaletteIcon, SunIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { copy } from '@/shared/copy/zh'
import type { ThemeMode } from './constants'
import { THEME_PRESETS } from './presets'
import { useTheme } from './useTheme'

const MODE_OPTIONS: { value: ThemeMode; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: copy.theme.light, icon: SunIcon },
  { value: 'dark', label: copy.theme.dark, icon: MoonIcon },
  { value: 'system', label: copy.theme.system, icon: MonitorIcon },
]

export function ThemeMenu() {
  const { mode, presetId, resolvedMode, setMode, setPresetId } = useTheme()
  const TriggerIcon = resolvedMode === 'dark' ? MoonIcon : SunIcon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={copy.theme.menuLabel}>
          <TriggerIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{copy.theme.modeLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
          {MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="text-muted-foreground" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <PaletteIcon className="size-3.5" />
          {copy.theme.presetLabel}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={presetId} onValueChange={setPresetId}>
          {THEME_PRESETS.map((p) => (
            <DropdownMenuRadioItem key={p.id} value={p.id}>
              <span
                className="size-3.5 rounded-full border border-black/10"
                style={{ background: p.swatch }}
                aria-hidden
              />
              {p.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
