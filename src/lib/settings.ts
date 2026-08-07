/**
 * 全局设置管理（基于 localStorage，无需数据库迁移）
 * - 外观主题（5 种清新低明度配色）
 * - 低库存预警阈值
 * - 通用偏好（默认仓库、入库步长、扫码枪灵敏度）
 * - 成本可见角色
 */

// ============ 类型 ============
export type ThemeName = 'lightgreen' | 'ricewhite' | 'softpurple' | 'lightred' | 'softblue'

export interface AppSettings {
  theme: ThemeName
  lowStockWarning: number
  lowStockDanger: number
  lowStockCritical: number
  defaultWarehouseId: string
  stockInStep: number
  scannerMinLength: number
  scannerMaxInterval: number
  costVisibleRoles: string[] // 可查看成本的角色
}

// ============ 默认值 ============
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'softblue',
  lowStockWarning: 30,
  lowStockDanger: 15,
  lowStockCritical: 5,
  defaultWarehouseId: '',
  stockInStep: 1,
  scannerMinLength: 4,
  scannerMaxInterval: 50,
  costVisibleRoles: ['super_admin', 'admin'],
}

// ============ 主题元数据 ============
export interface ThemeMeta {
  key: ThemeName
  label: string
  desc: string
  /** 主题色块（用于预览） */
  swatch: string
}

export const THEMES: ThemeMeta[] = [
  { key: 'lightgreen', label: '浅绿', desc: '清新草绿调', swatch: '#8ec9a4' },
  { key: 'ricewhite', label: '米白', desc: '温润米黄调', swatch: '#ece4d1' },
  { key: 'softpurple', label: '淡紫', desc: '柔和薰衣草', swatch: '#c7b7e0' },
  { key: 'lightred', label: '浅红', desc: '淡雅蜜桃粉', swatch: '#eab8b8' },
  { key: 'softblue', label: '淡蓝', desc: '晴空浅蓝调', swatch: '#a7c5d8' },
]

// ============ 存储 ============
const STORAGE_KEY = 'app-settings'

export function getSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw)
    // 如果老主题名存在，自动迁移为默认淡蓝
    const next: AppSettings = { ...DEFAULT_SETTINGS, ...parsed }
    if (!(['lightgreen', 'ricewhite', 'softpurple', 'lightred', 'softblue'] as const).includes(next.theme)) {
      next.theme = DEFAULT_SETTINGS.theme
    }
    return next
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const next = { ...current, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  // 主题变更时立即应用
  if (patch.theme) applyTheme(patch.theme)
  return next
}

export function resetSettings(): AppSettings {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  applyTheme(DEFAULT_SETTINGS.theme)
  return DEFAULT_SETTINGS
}

// ============ 主题应用 ============
const THEME_CLASSES: ThemeName[] = ['lightgreen', 'ricewhite', 'softpurple', 'lightred', 'softblue']

export function applyTheme(theme: ThemeName) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  for (const t of THEME_CLASSES) {
    el.classList.remove(`theme-${t}`)
  }
  el.classList.add(`theme-${theme}`)
  // 让 sonner / 自定义组件也能根据当前主题变量感知
  el.setAttribute('data-theme', theme)
}

/** 在应用启动时调用，从 localStorage 恢复主题 */
export function initTheme() {
  const s = getSettings()
  applyTheme(s.theme)
}

// ============ 导出 CSV 辅助 ============
export function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '')
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`
          }
          return s
        })
        .join(','),
    )
    .join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
