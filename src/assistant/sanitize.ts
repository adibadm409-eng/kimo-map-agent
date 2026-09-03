// تنظيف الردود قبل عرضها للمستخدم: يزيل المعرّفات الداخنة وأكواد الحالة
// الخام، ويفرض التسميات العربية النظيفة. هذا شبكة أمان تكميلية لتعليمات
// البرومبت؛ لا يجوز الاعتماد عليها وحدها دون توجيه النموذج.

const CODE_LABELS: Record<string, string> = {
  buy_offer: 'طلب شراء',
  sell_offer: 'عرض بيع',
  rent_offer: 'عرض إيجار',
  cash_payment: 'دفعة نقدية',
  installment_payment: 'قسط',
  pending: 'قيد الانتظار',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  available: 'متاح',
  sold: 'مبيعة',
  reserved: 'محجوز',
  rented: 'مؤجرة',
  active: 'نشط',
  completed: 'مكتمل',
  cancelled: 'ملغى',
  cancelled_by_user: 'ملغاة من المستخدم',
  draft: 'مسودة',
  created: 'أُنشئ',
  updated: 'حُدّث',
  deleted: 'حُذف',
  in_progress: 'قيد التنفيذ',
  failed: 'فاشلة',
}

function isInternalId(tok: string): boolean {
  if (tok.length < 12) return false
  if (!/[a-z]/.test(tok)) return false
  const digitCount = (tok.match(/\d/g) ?? []).length
  if (digitCount < 3) return false
  return true
}

export function sanitizeAssistantText(text: string): string {
  if (!text) return text
  let out = text
  // 1) ترجمة الرموز/الحالات التقنية إلى تسميات عربية
  const codeRe = new RegExp(`\\b(${Object.keys(CODE_LABELS).join('|')})\\b`, 'g')
  out = out.replace(codeRe, (m) => CODE_LABELS[m] ?? m)
  // 2) إزالة المعرّفات الداخلية (نمط مثل mszh218axqdkqv أو mt0hby0a2fx5m1)
  //    فقط إذا كان看起来像 random hash (أطول من 12 حرف + 3 أرقام على الأقل)
  out = out.replace(/\b[a-z0-9]{14,}\b/g, (m) => (isInternalId(m) ? '' : m))
  out = out.replace(/\b[a-z]{2,6}-[a-z0-9]{6,}\b/gi, (m) => (isInternalId(m.replace(/-/g, '')) ? '' : m))
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
  // 3) إزالة علامات backtick (ممنوعة في ردود المستخدم)
  out = out.replace(/`/g, '')
  // 4) تنظيف المسافات والأسطر الناتجة عن الحذف
  out = out.replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return out
}
