import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, fontSize } from '../theme/tokens'
import { Card } from '../components/ui'
import { getProperty, createProperty, updateProperty } from '../database/db'
import * as Location from 'expo-location'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'

const TYPES = [
  { key: 'apartment', label: 'شقة', icon: 'business-outline' },
  { key: 'villa', label: 'فيلا', icon: 'home-outline' },
  { key: 'house', label: 'بيت', icon: 'home-outline' },
  { key: 'hotel', label: 'فندق', icon: 'bed-outline' },
  { key: 'building', label: 'عمارة', icon: 'business-outline' },
  { key: 'residential_tower', label: 'برج سكني', icon: 'podium-outline' },
  { key: 'farm', label: 'مزرعة', icon: 'leaf-outline' },
  { key: 'land', label: 'قطعة أرض', icon: 'map-outline' },
  { key: 'warehouse', label: 'هناجر', icon: 'cube-outline' },
  { key: 'shop', label: 'محلات', icon: 'storefront-outline' },
  { key: 'office', label: 'مكتب', icon: 'briefcase-outline' },
  { key: 'commercial', label: 'تجاري', icon: 'storefront-outline' },
]

const STATUSES = [
  { key: 'for_sale', label: 'للبيع' },
  { key: 'pending', label: 'قيد الانتظار' },
  { key: 'sold', label: 'مباع' },
  { key: 'rented', label: 'مؤجر' },
]

function FormInput({ label, value, onChange, placeholder, keyboardType, multiline }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address'
  multiline?: boolean
}) {
  const { colors } = useTheme()
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        style={[styles.input, {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          color: colors.textPrimary,
          minHeight: multiline ? 80 : 48,
          textAlignVertical: multiline ? 'top' : 'center',
        }]}
      />
    </View>
  )
}

function Segmented({ options, value, onChange }: {
  options: { key: string; label: string; icon?: string }[]
  value: string
  onChange: (v: string) => void
}) {
  const { colors } = useTheme()
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          style={({ pressed }) => [
            styles.segmentedBtn,
            value === o.key ? { backgroundColor: colors.accent } : { backgroundColor: 'transparent' },
            pressed && { opacity: 0.7 },
          ]}
        >
          {o.icon ? (
            <Ionicons
              name={o.icon as any}
              size={14}
              color={value === o.key ? '#FFF' : colors.textSecondary}
            />
          ) : null}
          <Text style={{
            fontSize: fontSize.sm,
            fontWeight: '600',
            fontFamily: 'Tajawal_700Bold',
            color: value === o.key ? '#FFF' : colors.textSecondary,
          }}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

export default function PropertyForm() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const editingId = route.params?.id
  const [loading, setLoading] = useState(!!editingId)

  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    area: '',
    address: '',
    latitude: '',
    longitude: '',
    type: 'apartment',
    status: 'for_sale',
    owner_name: '',
    owner_phone: '',
    owner_email: '',
    broker_name: '',
    broker_phone: '',
    icon_uri: '',
  })
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const p = await getProperty(editingId)
        if (p && !cancelled) {
          setForm({
            name: p.name || '',
            description: p.description || '',
            price: String(p.price || ''),
            area: String(p.area || ''),
            address: p.address || '',
            latitude: p.latitude ? String(p.latitude) : '',
            longitude: p.longitude ? String(p.longitude) : '',
            type: p.type || 'apartment',
            status: p.status || 'for_sale',
            owner_name: p.owner_name || '',
            owner_phone: p.owner_phone || '',
            owner_email: p.owner_email || '',
            broker_name: p.broker_name || '',
            broker_phone: p.broker_phone || '',
            icon_uri: p.icon_uri || '',
          })
        }
      } catch (e) {
        console.error('Failed to load property:', e)
      }
    }
    if (editingId) load()
    return () => { cancelled = true }
  }, [editingId])

  async function handlePickIcon() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('الإذن', 'اسمح بالوصول إلى الصور لاختيار أيقونة العقار.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      })
      if (!result.canceled && result.assets[0]?.uri) {
        const sourceUri = result.assets[0].uri
        let iconUri = sourceUri
        if (FileSystem.documentDirectory && sourceUri !== FileSystem.documentDirectory) {
          const dir = `${FileSystem.documentDirectory}property_icons/`
          const dirInfo = await FileSystem.getInfoAsync(dir)
          if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
          const ext = (sourceUri.split('.').pop()?.split('?')[0] || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
          iconUri = `${dir}${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
          await FileSystem.copyAsync({ from: sourceUri, to: iconUri })
        }
        setForm((current) => ({ ...current, icon_uri: iconUri }))
      }
    } catch (error) {
      console.warn('Failed to choose property icon:', error)
    }
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال اسم العقار')
      return
    }
    const data = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price) || 0,
      area: Number(form.area) || 0,
      address: form.address.trim(),
      latitude: Number(form.latitude) || 0,
      longitude: Number(form.longitude) || 0,
      type: form.type as any,
      status: form.status as 'for_sale' | 'pending' | 'sold' | 'rented',
      owner_name: form.owner_name.trim(),
      owner_phone: form.owner_phone.trim(),
      owner_email: form.owner_email.trim(),
      broker_name: form.broker_name.trim(),
      broker_phone: form.broker_phone.trim(),
      icon_uri: form.icon_uri.trim(),
    }
    if (editingId) {
      await updateProperty(editingId, data)
    } else {
      await createProperty(data)
    }
    navigation.goBack()
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMuted, fontFamily: 'Tajawal_400Regular' }}>جاري التحميل...</Text>
      </View>
    )
  }

  async function handleGetCurrentLocation() {
    try {
      setLocating(true)
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('الإذن', 'يجب السماح بالوصول للموقع')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      setForm({
        ...form,
        latitude: loc.coords.latitude.toFixed(6),
        longitude: loc.coords.longitude.toFixed(6),
      })
    } catch (e) {
      Alert.alert('خطأ', 'تعذر تحديد الموقع')
    } finally {
      setLocating(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxxl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>
            {editingId ? 'تعديل العقار' : 'عقار جديد'}
          </Text>
        </View>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>المعلومات الأساسية</Text>
          <FormInput label="اسم العقار" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="مثال: فيلا النرجس" />
          <FormInput label="الوصف" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="وصف العقار" multiline />
          <FormInput label="العنوان" value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="الحي، المدينة" />
          <View style={styles.iconField}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>صورة أيقونة العقار (اختيارية)</Text>
            <View style={styles.iconRow}>
              {form.icon_uri ? <Image source={{ uri: form.icon_uri }} style={styles.iconPreview} /> : <View style={[styles.iconPreview, { backgroundColor: colors.accentSurface }]}><Ionicons name="image-outline" size={25} color={colors.accent} /></View>}
              <Pressable accessibilityRole="button" accessibilityLabel="اختيار صورة أيقونة للعقار" onPress={handlePickIcon} style={[styles.iconAction, { backgroundColor: colors.accentSurface, borderColor: colors.border }]}>
                <Ionicons name="images-outline" size={17} color={colors.accent} />
                <Text style={[styles.iconActionText, { color: colors.accent }]}>{form.icon_uri ? 'تغيير الصورة' : 'اختيار صورة'}</Text>
              </Pressable>
              {form.icon_uri ? <Pressable accessibilityRole="button" accessibilityLabel="إزالة صورة أيقونة العقار" onPress={() => setForm((current) => ({ ...current, icon_uri: '' }))} hitSlop={8}><Ionicons name="close-circle" size={22} color={colors.error} /></Pressable> : null}
            </View>
            <Text style={[styles.hint, { color: colors.textMuted }]}>تظهر في بطاقة التصفح السريع فقط، ويمكن تركها فارغة.</Text>
          </View>
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>الإحداثيات الجغرافية</Text>
            <Pressable
              onPress={handleGetCurrentLocation}
              disabled={locating}
              style={({ pressed }) => [styles.locateBtn, { backgroundColor: colors.accentSurface, opacity: pressed || locating ? 0.6 : 1 }]}
            >
              {locating ? (
                <ActivityIndicator size={14} color={colors.accent} />
              ) : (
                <Ionicons name="locate" size={14} color={colors.accent} />
              )}
              <Text style={[styles.locateBtnText, { color: colors.accent }]}>
                {locating ? 'جاري...' : 'موقعي'}
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>أضف الإحداثيات لظهور العقار على الخريطة</Text>
             <View style={styles.rowFields}>
             <View style={styles.halfField}>
               <FormInput label="خط العرض" value={form.latitude} onChange={(v) => setForm({ ...form, latitude: v })} placeholder="24.713600" keyboardType="numeric" />
             </View>
             <View style={styles.halfField}>
               <FormInput label="خط الطول" value={form.longitude} onChange={(v) => setForm({ ...form, longitude: v })} placeholder="46.675300" keyboardType="numeric" />
             </View>
           </View>
           <Pressable
             style={[styles.pickMapBtn, { borderColor: colors.border, borderWidth: 1 }]}
             onPress={async () => {
               const lat = parseFloat(form.latitude) || 24.7136
               const lng = parseFloat(form.longitude) || 46.6753
               const result = await navigation.navigate('MapScreen', { pickLocation: true, initialLat: lat, initialLng: lng })
               if (result?.latitude != null && result?.longitude != null) {
                 setForm({ ...form, latitude: String(result.latitude), longitude: String(result.longitude) })
                 Alert.alert("تم", `تم اختيار الموقع: ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}`)
               }
             }}
           >
             <Ionicons name="map-outline" size={18} color={colors.accent} />
             <Text style={[styles.pickMapText, { color: colors.accent }]}>اختيار الموقع من الخريطة</Text>
           </Pressable>
          </Card>

          <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>النوع والحالة</Text>
          <Text style={[styles.label, { color: colors.textSecondary }]}>النوع</Text>
          <Segmented options={TYPES} value={form.type} onChange={(v) => setForm({ ...form, type: v })} />
          <View style={{ height: spacing.md }} />
          <Text style={[styles.label, { color: colors.textSecondary }]}>الحالة</Text>
          <Segmented options={STATUSES} value={form.status} onChange={(v) => setForm({ ...form, status: v })} />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>السعر والمساحة</Text>
          <View style={styles.rowFields}>
            <View style={styles.halfField}>
              <FormInput label="السعر (ريال يمني)" value={form.price} onChange={(v) => setForm({ ...form, price: v })} placeholder="0" keyboardType="numeric" />
            </View>
            <View style={styles.halfField}>
              <FormInput label="المساحة (م²)" value={form.area} onChange={(v) => setForm({ ...form, area: v })} placeholder="0" keyboardType="numeric" />
            </View>
          </View>
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>معلومات المالك</Text>
          <FormInput label="اسم المالك" value={form.owner_name} onChange={(v) => setForm({ ...form, owner_name: v })} placeholder="الاسم الكامل" />
          <FormInput label="رقم الجوال" value={form.owner_phone} onChange={(v) => setForm({ ...form, owner_phone: v })} placeholder="05XXXXXXXX" keyboardType="phone-pad" />
          <FormInput label="البريد الإلكتروني" value={form.owner_email} onChange={(v) => setForm({ ...form, owner_email: v })} placeholder="email@example.com" keyboardType="email-address" />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>الدلال / صاحب العرض الأصلي</Text>
          <FormInput label="اسم الدلال" value={form.broker_name} onChange={(v) => setForm({ ...form, broker_name: v })} placeholder="اسم الدلال" />
          <FormInput label="رقم الدلال" value={form.broker_phone} onChange={(v) => setForm({ ...form, broker_phone: v })} placeholder="رقم الهاتف" keyboardType="phone-pad" />
          <Text style={[styles.hint, { color: colors.textMuted }]}>هذه البيانات اختيارية وتحفظ مع العقار لتسهيل الرجوع إلى مصدر العرض.</Text>
        </Card>

        <View style={styles.actions}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.actionBtn, styles.cancelBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>إلغاء</Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [styles.actionBtn, styles.saveBtn, { backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="checkmark" size={18} color="#FFF" />
            <Text style={[styles.actionBtnText, { color: '#FFF' }]}>حفظ</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  pageTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    fontFamily: 'Tajawal_700Bold',
  },
  section: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  iconField: { gap: spacing.xs },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconPreview: { width: 58, height: 58, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  iconAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  iconActionText: { fontSize: fontSize.sm, fontFamily: 'Tajawal_700Bold' },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    fontFamily: 'Tajawal_700Bold',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  locateBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    fontFamily: 'Tajawal_700Bold',
  },
  hint: {
    fontSize: fontSize.xs,
    fontFamily: 'Tajawal_400Regular',
    marginTop: -spacing.xs,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '500',
    fontFamily: 'Tajawal_500Medium',
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
    fontFamily: 'Tajawal_400Regular',
    textAlign: 'right',
  },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 4,
  },
  segmentedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    minWidth: '31%',
    justifyContent: 'center',
    gap: 4,
  },
  rowFields: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfField: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 50,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  cancelBtn: {},
  saveBtn: {
    borderWidth: 0,
  },
  pickMapBtn: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.sm },
  pickMapText: { fontSize: 12, fontFamily: "Tajawal_700Bold" },
  actionBtnText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    fontFamily: 'Tajawal_700Bold',
  },
})
