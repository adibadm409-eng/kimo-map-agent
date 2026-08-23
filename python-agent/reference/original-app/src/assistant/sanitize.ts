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
  if (tok.length < 10) return false
  if (!/[a-z]/.test(tok)) return false
  if (!/\d/.test(tok)) return false
  return true
}

export function sanitizeAssistantText(text: string): string {
  if (!text) return text
  let out = text
  // 1) ترجمة الرموز/الحالات التقنية إلى تسميات عربية
  const codeRe = new RegExp(`\\b(${Object.keys(CODE_LABELS).join('|')})\\b`, 'g')
  out = out.replace(codeRe, (m) => CODE_LABELS[m] ?? m)
  // 2) إزالة المعرّفات الداخلية (نمط مثل mszh218axqdkqv أو mt0hby0a2fx5m1)
  out = out.replace(/[a-z0-9]{10,}/g, (m) => (isInternalId(m) ? '' : m))
  // 3) إزالة علامات backtick (ممنوعة في ردود المستخدم)
  out = out.replace(/`/g, '')
  // 4) تنظيف المسافات والأسطر الناتجة عن الحذف
  out = out.replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return out
}
