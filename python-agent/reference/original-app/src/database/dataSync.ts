import { useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'

/**
 * جسر بثّ «تغيّرت بيانات» للواجهة:
 * أي كتابة في قاعدة البيانات (من الوكيل أو من الواجهة) تُطلِق notifyDataChanged،
 * فيشترك بها أي شاشة تحتاج إعادة التحميل (القوائم/العدادات/التفاصيل) لتُعكس
 * تغييرات الوكيل فوراً بلا انفصال بين ما أُنجز وما يُعرَض.
 */

type DataListener = (scope?: string) => void

const listeners = new Set<DataListener>()

/** اشترك في أحداث تغيّر البيانات؛ تُعيد دالة إلغاء الاشتراك. */
export function subscribeDataChanged(fn: DataListener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** إعلان تغيّر بيانات (الاتجاه: قاعدة البيانات → الواجهة). scope اختياري يصف نطاق التغيير. */
export function notifyDataChanged(scope?: string): void {
  listeners.forEach((fn) => {
    try {
      fn(scope)
    } catch {}
  })
}

/**
 * يجعل الشاشة تعيد التحميل عند دخولها (focus) وعند أي تغيّر في قاعدة البيانات.
 * البديل الآمن لـ useEffect([]) الذي يبقى الشاشة قديمة بعد تعديلات الوكيل.
 */
export function useReloadOnData(load: () => void | Promise<void>, deps: any[] = []): void {
  const reload = useCallback(() => {
    void load()
  }, deps)
  useFocusEffect(
    useCallback(() => {
      reload()
      return subscribeDataChanged(reload)
    }, [reload])
  )
}