import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '缺少 Supabase 配置未设置，请配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY',
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
)

export function getPublicUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export function getProductImageUrl(path: string | null) {
  if (!path) return ''
  return getPublicUrl('product-images', path)
}

export async function uploadProductImage(file: File) {
  const ext = file.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('product-images')
    .upload(fileName, file)
  if (error) throw error
  return fileName
}

export async function deleteProductImage(path: string) {
  await supabase.storage.from('product-images').remove([path])
}
