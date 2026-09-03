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

  // TTL بالميلي ثانية لكل نوع أداة — أي أداة غير مذكورة = 0 (بلا كاش افتراضياً)
  private static TTL: Record<string, number> = {
    query: 5 * 60 * 1000,
    get: 5 * 60 * 1000,
    search_everything: 3 * 60 * 1000,
    list_entities: 10 * 60 * 1000,
    catalog: 30 * 60 * 1000,
    schema_inspect: 30 * 60 * 1000,
    project_tree: 5 * 60 * 1000,
    project_financials: 5 * 60 * 1000,
    installment_schedule: 5 * 60 * 1000,
    payment_ledger: 5 * 60 * 1000,
    buyer_summary: 5 * 60 * 1000,
    dashboard_kpis: 5 * 60 * 1000,
    project_cashflow: 5 * 60 * 1000,
    data_snapshot: 2 * 60 * 1000,
    current_local_time: 1 * 60 * 1000,
    review_my_work: 3 * 60 * 1000,
    project_integrity_check: 3 * 60 * 1000,
    list_attachments: 2 * 60 * 1000,
    list_workspaces: 2 * 60 * 1000,
    workspace_get: 2 * 60 * 1000,
    audit_log_query: 2 * 60 * 1000,
    audit_log_summary: 2 * 60 * 1000,
    list_reminders: 1 * 60 * 1000,
    list_offer_reminders: 1 * 60 * 1000,
    project_nodes_list: 2 * 60 * 1000,
    project_profile_get: 5 * 60 * 1000,
  }

  private static stableStringify(v: any): string {
    if (v === null || typeof v !== 'object') return JSON.stringify(v)
    if (Array.isArray(v)) return `[${v.map((x) => ToolResultCache.stableStringify(x)).join(',')}]`
    const keys = Object.keys(v).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${ToolResultCache.stableStringify(v[k])}`).join(',')}}`
  }

  private makeKey(tool: string, args: Record<string, any>): string {
    return `${tool}:${ToolResultCache.stableStringify(args ?? {})}`
  }

  private static ttlFor(tool: string): number {
    return ToolResultCache.TTL[tool] ?? 0
  }

  get(tool: string, args: Record<string, any>): any | null {
    const ttl = ToolResultCache.ttlFor(tool)
    if (ttl === 0) return null

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
    const ttl = ToolResultCache.ttlFor(tool)
    if (ttl === 0) return

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
