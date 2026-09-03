import { runToolWithFeedback } from './toolSchemas'
import { withAuditCtx } from '../database/audit'
import { peekUndo, removeUndo } from './store'
import { performUndo } from './undo'
import type { UndoEntry } from './store'

/**
 * تنسيق الوكلاء الفرعيين (بتوازٍ) — قراءات فقط:
 * الوكيل القائد يستدعي أداة `orchestrate` بحزمة مهام مستقلة، فيُنفَّذ كل وكيل
 * فرعي بالتوازي عبر Promise.all ثم تعود النتائج بترتيبها مع [نجاح]/[فشل] وverified.
 * الكتابة الحساسة (حذف/دفع/استيراد/تعديل هيكلي) محظورة هنا وتُرفض صراحةً لتُنفَّذ
 * تسلسلياً عبر الحلقة الرئيسية حيث تعمل بوابات الموافقة والتدقيق والتراجع.
 */

const BLOCKED_PARALLEL_TOOLS = new Set([
  'delete',
  'create',
  'update',
  'mutate_record',
  'bulk_mutate',
  'ledger_record_payment',
  'ledger_reverse_payment',
  'project_import_commit',
  'property_intake_apply',
  'custom_field_set',
  'attach_media_to_entity',
  'unlink_entity_media',
  'remove_attachment',
  'workspace_create',
  'workspace_update',
  'workspace_delete',
  'workspace_add_table',
  'workspace_rename_table',
  'workspace_delete_table',
  'workspace_add_column',
  'workspace_add_columns',
  'workspace_rename_column',
  'workspace_remove_column',
  'workspace_alter_column',
  'workspace_add_row',
  'workspace_update_row',
  'workspace_delete_row',
  'workspace_import_rows',
  'workspace_create_full_table',
  'workspace_duplicate_table',
  'workspace_duplicate_workspace',
  'import_project_file',
  'create_offer_with_reminder',
  'offer_reminder_set',
  'create_reminder',
  'reminder_update',
  'cancel_reminder',
  'project_memory_clear',
])

export interface SubAgentTask {
  /** اسم الأداة الداخلية (مثل query/get/mutate_record/workspace_add_row…). */
  tool: string
  /** وسائط الأداة. */
  args: Record<string, any>
  /** وصف إنساني اختياري يثبت في الملخص ليسهل مراجعة النتيجة. */
  label?: string
  /** يمكن للقائد تعطيل التحقق الٳلزامي لمهمة ليكون التنفيذ أسرع (مثل قراءة مجردة). */
  skipVerify?: boolean
}

export interface SubAgentResult {
  tool: string
  label: string
  ok: boolean
  verified: boolean
  confidence: number
  observation: string
  result: any
  verification?: string
}

export interface OrchestrateSummary {
  total: number
  ok: number
  failed: number
  verified: number
}

export interface OrchestrateOutcome {
  results: SubAgentResult[]
  summary: OrchestrateSummary
}

/** قلبُ نتائج الفرعيّين إلى نتيجة منظمة بثقة صريحة — لا يمنع إكمال الباقي. */
function toResult(tool: string, label: string, out: Awaited<ReturnType<typeof runToolWithFeedback>>): SubAgentResult {
  const confidence = out.verified ? 0.95 : out.ok ? 0.7 : 0.1
  return {
    tool,
    label: label || tool,
    ok: out.ok,
    verified: out.verified,
    confidence,
    observation: out.observation,
    result: out.result ?? null,
    verification: out.verification,
  }
}

/**
 * ينفذ قائمة مهام مستقلة بالتوازي. كل مهمة تعمل في سياق منفَّذ `agent` وتحت
 * جلسة القائد، فيُسجَّل أثرها في سجل التدقيق كما لو نفذها الوكيل نفسه.
 */
export async function runSubAgents(
  sessionId: string,
  tasks: SubAgentTask[],
  opts?: { signal?: AbortSignal }
): Promise<OrchestrateOutcome> {
  const cleaned = Array.isArray(tasks)
    ? tasks
        .filter((t) => t && typeof t.tool === 'string' && t.tool.trim() && typeof t.args === 'object' && t.args !== null)
        .map((t) => ({ tool: String(t.tool).trim(), args: t.args as Record<string, any>, label: t.label ? String(t.label) : '', skipVerify: t.skipVerify === true }))
    : []

  if (!cleaned.length) {
    return { results: [], summary: { total: 0, ok: 0, failed: 0, verified: 0 } }
  }

  const runOne = async (task: (typeof cleaned)[number], index: number) => {
    if (BLOCKED_PARALLEL_TOOLS.has(task.tool)) {
      return {
        tool: task.tool,
        label: task.label || task.tool,
        ok: false,
        verified: false,
        confidence: 0.05,
        observation: `[مرفوض] «${task.tool}» كتابة حساسة لا تُنفَّذ عبر orchestrate المتوازي؛ نفّذها تسلسلياً عبر الحلقة الرئيسية (execute) لتخضع للموافقة والتحقق والتراجع.`,
        result: { error: 'parallel_write_blocked' },
      }
    }
    if (opts?.signal?.aborted) {
      return toResult(task.tool, task.label, {
        ok: false,
        args: task.args,
        observation: '[فشل] أُلغي النفيذ قبل البدء.',
        result: { error: 'aborted' },
        verified: false,
      })
    }
    try {
      const out = await withAuditCtx({ actor: 'agent', sessionId, tool: task.tool }, () =>
        runToolWithFeedback(task.tool, task.args)
      )
      if (task.skipVerify && out.ok) return toResult(task.tool, task.label, { ...out, verified: false })
      return toResult(task.tool, task.label, out)
    } catch (error: any) {
      return {
        tool: task.tool,
        label: task.label || task.tool,
        ok: false,
        verified: false,
        confidence: 0.05,
        observation: `[فشل] ${error?.message ?? String(error)}`,
        result: { error: 'subagent_exception', detail: error?.message ?? String(error) },
      }
    }
  }

  const results = await Promise.all(cleaned.map((task, index) => runOne(task, index)))
  const summary: OrchestrateSummary = {
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    verified: results.filter((r) => r.verified).length,
  }
  return { results, summary }
}

/** مراجعة أعمال الوكلاء الفرعيين: يقرأ كل نتيجة ويمنح نسبة ثقة فحسب دون منع. */
export function reviewSubAgentResults(outcome: OrchestrateOutcome): string {
  const { results, summary } = outcome
  if (!results.length) return '[مراجعة] لا توجد نتائج فرعية لمراجعتها.'
  const lines = results.map((r, i) => {
    const status = r.verified ? 'موثَّق' : r.ok ? 'نجح (بلا تحقق)' : 'فشل'
    return `${i + 1}. ${r.label || r.tool}: ${status} (ثقة ${Math.round(r.confidence * 100)}%)`
  })
  return [
    `[مراجعة] اكتمل ${summary.ok}/${summary.total} موثَّق منها ${summary.verified}.`,
    ...lines,
  ].join('\n')
}

/** تراجع عن أحدث عملية فرعية قابلة للتراجع في جلسة القائد (أثر وكيل فرعي أُسيء تنفيذه). */
export async function undoLastSubAgent(sessionId: string): Promise<string> {
  try {
    const entry: UndoEntry | null | undefined = await peekUndo(sessionId)
    if (!entry) return '[تراجع] لا توجد عمليات قابلة للتراجع في هذه الجلسة.'
    const result = await withAuditCtx({ actor: 'undo', sessionId, tool: 'undo_last' }, () => performUndo(entry))
    await removeUndo(entry.id)
    return `[تراجع] ${result}`
  } catch (error: any) {
    return `[تراجع] فشل التراجع: ${error?.message ?? String(error)}`
  }
}