export function formatPrice(price: number): string {
  return new Intl.NumberFormat('ar-SA').format(price || 0)
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return dateStr
  }
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }) + ' · ' +
      d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}

export function timeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `منذ ${mins} دقيقة`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${hours} ساعة`
  const days = Math.floor(hours / 24)
  if (days < 30) return `منذ ${days} يوم`
  return new Date(dateStr).toLocaleDateString('ar-SA')
}
