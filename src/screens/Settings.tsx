import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, Switch, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card } from '../components/ui'
import { clearAllReminders, getDB } from '../database/db'
import { getAllProjects } from '../database/projects'
import { listWorkspaces } from '../database/workspace'
import { listSessions } from '../assistant/store'
import { useReloadOnData } from '../database/dataSync'

const countQueries = {
  properties: 'SELECT COUNT(*) as c FROM properties',
  clients: 'SELECT COUNT(*) as c FROM clients',
  offers: 'SELECT COUNT(*) as c FROM offers',
  reminders: "SELECT COUNT(*) as c FROM reminders WHERE status = 'scheduled'",
  campaigns: 'SELECT COUNT(*) as c FROM campaigns',
  viewings: 'SELECT COUNT(*) as c FROM viewings',
  projects: 'SELECT COUNT(*) as c FROM projects',
  blocks: 'SELECT COUNT(*) as c FROM blocks',
  plots: 'SELECT COUNT(*) as c FROM plots',
  plot_payments: 'SELECT COUNT(*) as c FROM plot_payments',
  workspaces: 'SELECT COUNT(*) as c FROM workspaces',
  workspace_rows: 'SELECT COUNT(*) as c FROM workspace_rows',
  custom_fields: 'SELECT COUNT(*) as c FROM custom_fields',
  custom_field_values: 'SELECT COUNT(*) as c FROM custom_field_values',
  agent_sessions: 'SELECT COUNT(*) as c FROM agent_sessions',
  agent_messages: 'SELECT COUNT(*) as c FROM agent_messages',
  agent_undo: 'SELECT COUNT(*) as c FROM agent_undo',
  agent_runtime_events: 'SELECT COUNT(*) as c FROM agent_runtime_events',
  change_log: 'SELECT COUNT(*) as c FROM change_log',
}

/** ترتيب الحذف من الجداول التابعة إلى الأصلية؛ كل الجدولة موجودة في مخطط التطبيق الحالي. */
const DELETE_ALL_TABLES = [
  'plot_payments', 'plots', 'blocks', 'projects',
  'workspace_rows', 'workspace_tables', 'workspaces',
  'agent_runtime_events', 'agent_brain', 'agent_pending', 'agent_undo', 'agent_messages', 'agent_sessions',
  'agent_attachments', 'agent_generated_files', 'project_memory', 'change_log',
  'custom_field_values', 'custom_fields', 'reminders', 'viewings', 'offers', 'campaigns', 'properties', 'clients', 'waypoints', 'areas',
] as const

const ICONS: Record<string, string> = {
  properties: 'business-outline',
  clients: 'people-outline',
  offers: 'pricetags-outline',
  reminders: 'alarm-outline',
  campaigns: 'megaphone-outline',
  viewings: 'calendar-outline',
  projects: 'albums-outline',
  blocks: 'grid-outline',
  plots: 'map-outline',
  plot_payments: 'cash-outline',
  workspaces: 'file-tray-full-outline',
  workspace_rows: 'list-outline',
  agent_sessions: 'chatbubbles-outline',
  agent_messages: 'chatbox-ellipses-outline',
  change_log: 'document-text-outline',
}

export default function Settings() {
  const { colors, mode, toggle } = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(Object.keys(countQueries).map((key) => [key, 0]))
  )

  useReloadOnData(load)

  async function load() {
    try {
      // استدعاء دوال القراءة يضمن إنشاء مخططات المشاريع والمساحات والوكيل قبل العد.
      await Promise.all([getAllProjects(), listWorkspaces(), listSessions()])
      const db = await getDB()
      const results = await Promise.all(Object.entries(countQueries).map(async ([key, sql]) => {
        const row = await db.getFirstAsync<{ c: number }>(sql)
        return [key, row?.c || 0]
      }))
      setCounts(Object.fromEntries(results))
    } catch (e) {
      console.error('Failed to load stats:', e)
    }
  }

  async function handleDeleteAll() {
    Alert.alert(
      'حذف جميع البيانات',
      'هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllReminders()
              const db = await getDB()
              await db.withTransactionAsync(async () => {
                for (const table of DELETE_ALL_TABLES) {
                  await db.runAsync(`DELETE FROM ${table}`)
                }
              })
              setCounts(Object.fromEntries(Object.keys(countQueries).map((key) => [key, 0])))
            } catch (e) {
              Alert.alert('خطأ', 'تعذر حذف البيانات')
            }
          },
        },
      ]
    )
  }

  const labels: Record<string, string> = {
    properties: 'العقارات', clients: 'العملاء', offers: 'العروض', reminders: 'التذكيرات القادمة', campaigns: 'الحملات', viewings: 'المعاينات',
    projects: 'المشاريع', blocks: 'البلوكات', plots: 'القطع', plot_payments: 'دفعات القطع',
    workspaces: 'مساحات العمل', workspace_rows: 'صفوف العمل', agent_sessions: 'جلسات كيمو',
    agent_messages: 'رسائل كيمو', agent_undo: 'تراجعات كيمو', agent_runtime_events: 'أحداث كيمو',
    custom_fields: 'تعريفات الحقول', custom_field_values: 'قيم الحقول', change_log: 'سجل التدقيق',
  }
  const dbItems = Object.entries(counts).map(([key, count]) => ({
    label: labels[key] || key,
    count,
    icon: ICONS[key] || 'server-outline',
  }))

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxxl }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>الإعدادات</Text>
      </View>

      <Card style={styles.section}>
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <View style={[styles.iconBox, { backgroundColor: mode === 'dark' ? '#1E293B' : '#EFF6FF' }]}>
              <Ionicons name={mode === 'dark' ? 'moon-outline' : 'sunny-outline'} size={18} color={colors.accent} />
            </View>
            <View>
              <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>الوضع الليلي</Text>
              <Text style={[styles.settingDesc, { color: colors.textMuted }]}>تبديل بين الوضع الفاتح والداكن</Text>
            </View>
          </View>
          <Switch
            value={mode === 'dark'}
            onValueChange={toggle}
            trackColor={{ false: colors.surface, true: colors.accent + '60' }}
            thumbColor={mode === 'dark' ? colors.accent : colors.textMuted}
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>الخرائط</Text>
        <Pressable
          onPress={() => navigation.navigate('MapSettings')}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: mode === 'dark' ? '#1E293B' : '#ECFDF5' }]}>
                <Ionicons name="map-outline" size={18} color="#10B981" />
              </View>
              <View>
                <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>مزوّدو الخرائط</Text>
                <Text style={[styles.settingDesc, { color: colors.textMuted }]}>الأنماط المتوفرة، إخفاء/إظهار، والمزوّدات التي تتطلب مفاتيح</Text>
              </View>
            </View>
            <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
          </View>
        </Pressable>
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>قاعدة البيانات</Text>
        {dbItems.map((item, i) => (
          <View key={i} style={[styles.dbRow, { borderBottomColor: colors.border }, i === dbItems.length - 1 ? { borderBottomWidth: 0 } : null]}>
            <View style={styles.dbLeft}>
              <Ionicons name={item.icon as any} size={16} color={colors.textSecondary} />
              <Text style={[styles.dbLabel, { color: colors.textSecondary }]}>{item.label}</Text>
            </View>
            <Text style={[styles.dbCount, { color: colors.textPrimary }]}>{item.count}</Text>
          </View>
        ))}
      </Card>

      <Card style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>معلومات التطبيق</Text>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>الإصدار</Text>
          <Text style={[styles.infoValue, { color: colors.textPrimary }]}>1.0.0</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>المنصة</Text>
          <Text style={[styles.infoValue, { color: colors.textPrimary }]}>React Native (Expo SDK 54)</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>قاعدة البيانات</Text>
          <Text style={[styles.infoValue, { color: colors.textPrimary }]}>SQLite محلي</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>اللغة</Text>
          <Text style={[styles.infoValue, { color: colors.textPrimary }]}>العربية</Text>
        </View>
      </Card>

      <Pressable
        onPress={handleDeleteAll}
        style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="trash-outline" size={20} color="#DC2626" />
        <Text style={styles.deleteBtnText}>حذف جميع البيانات</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  pageTitle: { fontSize: fontSize.xxl, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  section: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  iconBox: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  settingDesc: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  dbRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  dbLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dbLabel: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
  dbCount: { fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  infoLabel: { fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
  infoValue: { fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Tajawal_700Bold' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: '#DC2626' + '30' },
  deleteBtnText: { fontSize: fontSize.md, fontWeight: '600', fontFamily: 'Tajawal_700Bold', color: '#DC2626' },
})