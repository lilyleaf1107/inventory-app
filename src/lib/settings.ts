/**
 * 全局设置管理（基于 localStorage，无需数据库迁移）
 * - 外观主题（5 种清新低明度配色）
 * - 低库存预警阈值
 * - 通用偏好（默认仓库、入库步长、扫码枪灵敏度）
 * - 成本可见角色
 */

// ============ 类型 ============
export type ThemeName = 'inkstone' | 'celadon' | 'mistblue' | 'lotus' | 'warmclay'

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
  theme: 'inkstone',
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
  { key: 'inkstone', label: '墨石', desc: '沉稳灰黑', swatch: '#1e1e24' },
  { key: 'celadon', label: '青瓷', desc: '清雅青绿', swatch: '#3a6b62' },
  { key: 'mistblue', label: '雾蓝', desc: '静谧蓝灰', swatch: '#3a5878' },
  { key: 'lotus', label: '藕荷', desc: '柔和藕紫', swatch: '#5a4a6b' },
  { key: 'warmclay', label: '暖陶', desc: '温润陶土', swatch: '#7a4a35' },
]

// ============ 存储 ============
const STORAGE_KEY = 'app-settings'

export function getSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_SETTINGS, ...parsed }
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
const THEME_CLASSES: ThemeName[] = ['inkstone', 'celadon', 'mistblue', 'lotus', 'warmclay']

export function applyTheme(theme: ThemeName) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  // 移除所有主题类
  for (const t of THEME_CLASSES) {
    el.classList.remove(`theme-${t}`)
  }
  // inkstone 是默认 :root，不需要额外 class
  if (theme !== 'inkstone') {
    el.classList.add(`theme-${theme}`)
  }
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
