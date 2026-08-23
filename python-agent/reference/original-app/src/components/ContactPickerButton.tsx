import { useMemo, useState } from 'react'
import { Alert, FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import * as Contacts from 'expo-contacts'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../theme/ThemeContext'
import { fontSize, radius, spacing } from '../theme/tokens'

export interface ContactSelection {
  name: string
  phone: string
}

interface ContactPickerButtonProps {
  label?: string
  onSelect: (contact: ContactSelection) => void
}

export function ContactPickerButton({ label = 'اختيار من جهات الاتصال', onSelect }: ContactPickerButtonProps) {
  const { colors } = useTheme()
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [contacts, setContacts] = useState<Contacts.Contact[]>([])
  const [search, setSearch] = useState('')

  const openPicker = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('غير متاح على الويب', 'اختيار جهات الاتصال متاح في نسخة Android أو iOS. يمكنك كتابة الاسم والرقم مباشرة.')
      return
    }
    setLoading(true)
    try {
      const permission = await Contacts.requestPermissionsAsync()
      if (permission.status !== Contacts.PermissionStatus.GRANTED) {
        Alert.alert('صلاحية جهات الاتصال', 'اسمح للتطبيق بالوصول إلى جهات الاتصال لاختيار الاسم والرقم تلقائياً.')
        return
      }
      const result = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] })
      setContacts(result.data.filter((contact) => contact.phoneNumbers?.some((item) => item.number)))
      setSearch('')
      setVisible(true)
    } catch {
      Alert.alert('تعذر قراءة جهات الاتصال', 'يمكنك متابعة إدخال الاسم والرقم يدوياً.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return contacts
    return contacts.filter((contact) => {
      const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`
      const numbers = contact.phoneNumbers?.map((item) => item.number || '').join(' ') || ''
      return `${name} ${numbers}`.toLowerCase().includes(needle)
    })
  }, [contacts, search])

  const selectContact = (contact: Contacts.Contact) => {
    const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
    const phone = contact.phoneNumbers?.find((item) => item.number)?.number || ''
    if (!name && !phone) return
    onSelect({ name, phone })
    setVisible(false)
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => { void openPicker() }}
        style={({ pressed }) => [styles.button, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed || loading ? 0.65 : 1 }]}
      >
        <Ionicons name="people-outline" size={16} color={colors.accent} />
        <Text style={[styles.buttonText, { color: colors.accent }]}>{loading ? 'جاري القراءة...' : label}</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.bgSecondary }]}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>اختيار جهة اتصال</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>يمكنك تعديل الاسم والرقم بعد الاختيار</Text>
              </View>
              <Pressable onPress={() => setVisible(false)} hitSlop={10} style={[styles.close, { backgroundColor: colors.surface }]}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
            <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={18} color={colors.textMuted} />
              <TextInput value={search} onChangeText={setSearch} placeholder="ابحث بالاسم أو الرقم" placeholderTextColor={colors.textMuted} style={[styles.searchInput, { color: colors.textPrimary }]} />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(item, index) => `${item.name || item.firstName || 'contact'}-${index}`}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
              ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>لا توجد جهات اتصال برقم مطابق</Text>}
              renderItem={({ item }) => {
                const number = item.phoneNumbers?.find((entry) => entry.number)?.number || ''
                return (
                  <Pressable onPress={() => selectContact(item)} style={({ pressed }) => [styles.contactRow, { borderBottomColor: colors.border, opacity: pressed ? 0.65 : 1 }]}>
                    <View style={[styles.avatar, { backgroundColor: colors.accent + '18' }]}><Ionicons name="person-outline" size={18} color={colors.accent} /></View>
                    <View style={styles.contactInfo}>
                      <Text style={[styles.contactName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'بدون اسم'}</Text>
                      <Text style={[styles.contactPhone, { color: colors.textSecondary }]} numberOfLines={1}>{number}</Text>
                    </View>
                    <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
                  </Pressable>
                )
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  buttonText: { fontSize: fontSize.xs, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  sheet: { height: '82%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  title: { fontSize: fontSize.lg, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  subtitle: { fontSize: fontSize.xs, marginTop: 3, fontFamily: 'Tajawal_400Regular' },
  close: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  search: { height: 46, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular', textAlign: 'right' },
  list: { paddingTop: spacing.md },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 38, height: 38, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  contactInfo: { flex: 1, gap: 3 },
  contactName: { fontSize: fontSize.md, fontWeight: '700', fontFamily: 'Tajawal_700Bold' },
  contactPhone: { fontSize: fontSize.sm, fontFamily: 'Tajawal_400Regular' },
  empty: { textAlign: 'center', paddingVertical: spacing.xl, fontSize: fontSize.md, fontFamily: 'Tajawal_400Regular' },
})
