import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/types'

/**
 * 通过条形码查询产品
 */
export function useProductByBarcode(barcode: string | null) {
  return useQuery({
    queryKey: ['product-by-barcode', barcode],
    enabled: !!barcode,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('barcode', barcode)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as Product | null
    },
    staleTime: 0,
  })
}
