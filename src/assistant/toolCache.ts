/**
 * ذاكرة مؤقتة لنتائج الأدوات — تجنب إعادة التنفيذ لنفس الطلبات.
 * TTL (Time To Live) لكل نوع أداة:
 * - قراءة: 5 دقائق (بيانات تتغير ببطء)
 * - كتابة: لا cache (معدلات)
 * - إحصائيات: 10 دقائق
 */

interface CacheEntry {
  key: string
  result: any
  timestamp: number
  ttl: number
  hitCount: number
}

class ToolResultCache {
  private cache = new Map<string, CacheEntry>()
  private maxEntries = 100

  // TTL بالميلي ثانية لكل نوع أداة
  private static TTL: Record<string, number> = {
    // قراءة: 5 دقائق
    query: 5 * 60 * 1000,
    get: 5 * 60 * 1000,
    search_everything: 3 * 60 * 1000,
    list_entities: 10 * 60 * 1000,
    catalog: 30 * 60 * 1000,
    schema_inspect: 30 * 60 * 1000,
    // مالية: 5 دقائق
    project_tree: 5 * 60 * 1000,
    project_financials: 5 * 60 * 1000,
    installment_schedule: 5 * 60 * 1000,
    payment_ledger: 5 * 60 * 1000,
    buyer_summary: 5 * 60 * 1000,
    dashboard_kpis: 5 * 60 * 1000,
    project_cashflow: 5 * 60 * 1000,
    data_snapshot: 2 * 60 * 1000,
    // وقت: دقيقة واحدة
    current_local_time: 1 * 60 * 1000,
    // مراجعة: 3 دقائق
    review_my_work: 3 * 60 * 1000,
    project_integrity_check: 3 * 60 * 1000,
    // كتابة: لا cache
    mutate_record: 0,
    create: 0,
    update: 0,
    delete: 0,
    ledger_record_payment: 0,
    workspace_add_row: 0,
    workspace_import_rows: 0,
  }

  private makeKey(tool: string, args: Record<string, any>): string {
    return `${tool}:${JSON.stringify(args, Object.keys(args).sort())}`
  }

  get(tool: string, args: Record<string, any>): any | null {
    const ttl = ToolResultCache.TTL[tool]
    if (ttl === 0) return null // لا cache للكتابة

    const key = this.makeKey(tool, args)
    const entry = this.cache.get(key)
    if (!entry) return null

    // فحص انتهاء الصلاحية
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    entry.hitCount++
    return entry.result
  }

  set(tool: string, args: Record<string, any>, result: any): void {
    const ttl = ToolResultCache.TTL[tool]
    if (ttl === 0) return // لا cache للكتابة

    const key = this.makeKey(tool, args)

    // إزالة أقدم إذا تجاوزنا الحد
    if (this.cache.size >= this.maxEntries) {
      let oldestKey = ''
      let oldestTime = Infinity
      for (const [k, v] of this.cache) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp
          oldestKey = k
        }
      }
      if (oldestKey) this.cache.delete(oldestKey)
    }

    this.cache.set(key, {
      key,
      result,
      timestamp: Date.now(),
      ttl,
      hitCount: 0,
    })
  }

  clear(): void {
    this.cache.clear()
  }

  getStats(): { size: number; totalHits: number; hitRate: number } {
    let totalHits = 0
    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount
    }
    return {
      size: this.cache.size,
      totalHits,
      hitRate: this.cache.size > 0 ? totalHits / this.cache.size : 0,
    }
  }
}

export const toolCache = new ToolResultCache()
