export const OPENING_DIALOGUE_DIRECTIVE =
  'هذه أول استجابة للمهمة التنفيذية: أرسل للمستخدم رداً افتتاحياً موجزاً يثبت فهمك للنطاق وما ستفعله أو ما يحتاج قراراً. لا تستدعِ أدوات في هذه الجولة ولا تعلن نجاحاً أو فشلاً، ولا تسرد التفكير الداخلي الخام أو أسماء الأدوات. بعد هذا الرد ستنتقل الخطة والتنفيذ إلى جولة مستقلة.'

export function needsOpeningDialogue(taskId: string | undefined, resumed: boolean): boolean {
  return Boolean(taskId && !resumed)
}
