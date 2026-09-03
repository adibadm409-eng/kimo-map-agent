import React, { useState } from 'react'
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'

const SEEN_KEY = 'whatsnew_seen_2_0_0'

export async function shouldShowWhatsNew(): Promise<boolean> {
  try {
    const seen = await AsyncStorage.getItem(SEEN_KEY)
    return seen !== '1'
  } catch {
    return false
  }
}

export async function markWhatsNewSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_KEY, '1')
  } catch {}
}

const HIGHLIGHTS: { icon: string; title: string; desc: string }[] = [
  {
    icon: 'text-outline',
    title: 'اقتراحات ذكية أثناء الكتابة',
    desc: 'عند كتابة أي اسم أو رقم هاتف في التطبيق تظهر لك الأسماء المشابهة المحفوظة، اختر منها فيملأ الحقول تلقائياً.',
  },
  {
    icon: 'people-outline',
    title: 'قسما الملاك والدلالين',
    desc: 'صفحة العملاء أصبحت ثلاثة أقسام: العملاء والملاك والدلالون، مع تجميع كل تسجيلات الشخص في مكان واحد وعدادات واضحة.',
  },
  {
    icon: 'layers-outline',
    title: 'بطاقة خطة المساعد',
    desc: 'عندما تطلب من المساعد مهمة كبيرة تظهر لك بطاقة أنيقة بخطواته ونسبة إنجازه أولاً بأول ثم تختفي عند الانتهاء.',
  },
  {
    icon: 'mic-outline',
    title: 'إعدادات الصوت ومعاينة التسجيل',
    desc: 'يمكنك الآن اختيار خدمة تحويل الكلام إلى نص من الإعدادات، ومراجعة تسجيلك الصوتي وحذفه قبل إرساله.',
  },
  {
    icon: 'rocket-outline',
    title: 'أسرع وأثبت',
    desc: 'استجابة أسرع للمساعد، وإصلاحات عامة لثبات التطبيق ودقة البيانات في كل الشاشات.',
  },
]

export default function WhatsNewCard({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme()
  const [leaving, setLeaving] = useState(false)

  async function dismiss() {
    if (leaving) return
    setLeaving(true)
    await markWhatsNewSeen()
    onClose()
    setLeaving(false)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
          <View style={[styles.hero, { backgroundColor: colors.accentSurface }]}>
            <View style={[styles.heroIcon, { backgroundColor: colors.accent }]}>
              <Ionicons name="sparkles" size={26} color="#FFF" />
            </View>
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>تحديث جديد وصل!</Text>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>أهم ما أضفناه لك في هذه النسخة</Text>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {HIGHLIGHTS.map((h, i) => (
              <View key={i} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.rowIcon, { backgroundColor: colors.accentSurface }]}>
                  <Ionicons name={h.icon as any} size={17} color={colors.accent} />
                </View>
                <View style={styles.rowMain}>
                  <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{h.title}</Text>
                  <Text style={[styles.rowDesc, { color: colors.textSecondary }]}>{h.desc}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ابدأ استخدام التحديث الجديد"
              onPress={dismiss}
              style={({ pressed }) => [styles.cta, { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={styles.ctaText}>ابدأ الاستخدام</Text>
              <Ionicons name="arrow-back" size={18} color="#FFF" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { width: '100%', maxWidth: 420, maxHeight: '86%', borderWidth: 1, borderRadius: radius.xl, overflow: 'hidden' },
  hero: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, gap: 4 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle: { fontSize: fontSize.xxl, fontFamily: 'Tajawal_800ExtraBold' },
  heroSub: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  list: { maxHeight: 340 },
  listContent: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold', textAlign: 'right' },
  rowDesc: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular', textAlign: 'right', lineHeight: 20 },
  footer: { padding: spacing.md },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 52, borderRadius: radius.full },
  ctaText: { fontSize: fontSize.md, fontFamily: 'Tajawal_700Bold', color: '#FFF' },
})
