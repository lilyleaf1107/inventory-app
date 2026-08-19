import Taro from '@tarojs/taro'

export interface ScanResult {
  result: string
  type: string
}

/**
 * 调用微信原生扫码（小程序环境），无需 HTTPS，不依赖摄像头权限弹窗。
 * 可扫条码 / QR 码，可支持扫码枪（触发 chooseMedia / 图片选图扫码）
 */
export async function scanCode(opts?: {
  scanType?: ('barCode' | 'qrCode')[]
  onlyCamera?: boolean
}): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    Taro.scanCode({
      onlyFromCamera: opts?.onlyCamera ?? false,
      scanType: opts?.scanType || ['barCode', 'qrCode'],
      success: (res) => {
        resolve({ result: res.result || '', type: res.scanType || '' })
      },
      fail: (err) => {
        // 用户取消也算正常
        if (String(err.errMsg || '').includes('cancel')) {
          resolve({ result: '', type: 'cancel' })
        } else {
          reject(err)
        }
      },
    })
  })
}

/**
 * 兼容旧命名：scanBarcode = scanCode
 */
export const scanBarcode = scanCode

/**
 * 通过条码查询产品，先匹配 barcode，再匹配 SKU
 */
export async function findProductByCode(code: string) {
  if (!code) return null
  const { supabase } = await import('@/lib/supabase')
  const trimmed = code.trim()
  // 查 barcode
  let { data } = await supabase
    .from('products')
    .select('*')
    .eq('barcode', trimmed)
    .limit(1)
  if (data && data.length > 0) return data[0]
  // 查 sku
  ;({ data } = await supabase
    .from('products')
    .select('*')
    .eq('sku', trimmed)
    .limit(1))
  return data && data.length > 0 ? data[0] : null
}
