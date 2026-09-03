import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, radius, fontSize } from '../../theme/tokens';
import { Card, Button, Input } from '../../components/ui';
import SuggestField from '../../components/SuggestField';
import {
  getPlot,
  savePlot,
  setPlotStatus,
  deletePlot,
  getPaymentsByPlot,
  deletePayment,
  getCustomFields,
  getCustomValues,
  setCustomValue,
  PLOT_STATUS_LABELS,
  INSTALLMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../../database/projects';
import type {
  Plot,
  PlotStatus,
  PlotPayment,
  CustomField,
  CustomFieldValue,
  InstallmentType,
} from '../../database/projects';
import { useReloadOnData } from '../../database/dataSync';

const STATUS_OPTIONS: { key: PlotStatus; label: string; color: string }[] = [
  { key: 'available', label: 'متاحة', color: '#2fa76f' },
  { key: 'sold', label: 'مبيعة', color: '#d64545' },
  { key: 'installment', label: 'قيد التقسيط', color: '#e6a23c' },
];

const INSTALLMENT_OPTIONS: { key: InstallmentType | ''; label: string }[] = [
  { key: 'monthly', label: 'شهري' },
  { key: 'quarterly', label: 'ربع سنوي' },
  { key: 'semi_annual', label: 'نصف سنوي' },
  { key: 'annual', label: 'سنوي' },
];

type RouteParams = { plotId: string };

export default function PlotDetail() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { plotId } = (route.params as RouteParams) ?? { plotId: '' };
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [plot, setPlot] = useState<Plot | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const [plotNo, setPlotNo] = useState('');
  const [areaSqm, setAreaSqm] = useState('');
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<PlotStatus>('available');
  const [boundaryNorth, setBoundaryNorth] = useState('');
  const [boundarySouth, setBoundarySouth] = useState('');
  const [boundaryEast, setBoundaryEast] = useState('');
  const [boundaryWest, setBoundaryWest] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerContact, setBuyerContact] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [installmentType, setInstallmentType] = useState<InstallmentType | ''>('');

  const [payments, setPayments] = useState<PlotPayment[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<CustomFieldValue[]>([]);
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const p = await getPlot(plotId);
    if (p) {
      setPlot(p);
      setPlotNo(p.plot_no);
      setAreaSqm(p.area_sqm != null ? String(p.area_sqm) : '');
      setValue(p.value != null ? String(p.value) : '');
      setStatus(p.status);
      setBoundaryNorth(p.boundary_north ?? '');
      setBoundarySouth(p.boundary_south ?? '');
      setBoundaryEast(p.boundary_east ?? '');
      setBoundaryWest(p.boundary_west ?? '');
      setBuyerName(p.buyer_name ?? '');
      setBuyerContact(p.buyer_contact ?? '');
      setSaleDate(p.sale_date ?? '');
      setInstallmentType(p.installment_type ?? '');
    }
    const pays = await getPaymentsByPlot(plotId);
    setPayments(pays);
    const cf = await getCustomFields('plot');
    setCustomFields(cf);
    const cv = await getCustomValues('plot', plotId);
    setCustomValues(cv);
    setValueDrafts({});
    setLoading(false);
  }, [plotId]);

  useReloadOnData(load, [plotId]);

  const confirmDelete = () => {
    Alert.alert('حذف القطعة', 'هل أنت متأكد من حذف هذه القطعة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          await deletePlot(plotId);
          navigation.goBack();
        },
      },
    ]);
  };

  const onStatusChange = async (key: PlotStatus) => {
    setStatus(key);
    setPlot((prev) => (prev ? { ...prev, status: key } : prev));
    await setPlotStatus(plotId, key);
    if (key === 'available') {
      setBuyerName('');
      setBuyerContact('');
      setSaleDate('');
      setInstallmentType('');
    }
  };

  const handleSave = async () => {
    if (!plot) return;
    await savePlot(plotId, {
      plot_no: plotNo,
      area_sqm: parseFloat(areaSqm) || 0,
      value: parseFloat(value) || 0,
      boundary_north: boundaryNorth,
      boundary_south: boundarySouth,
      boundary_east: boundaryEast,
      boundary_west: boundaryWest,
      buyer_name: buyerName,
      buyer_contact: buyerContact,
      sale_date: saleDate,
      installment_type: installmentType,
    });
    setEditing(false);
    load();
  };

  const getFieldValue = (fieldId: string) => {
    if (valueDrafts[fieldId] !== undefined) return valueDrafts[fieldId];
    const found = customValues.find((cv) => cv.field_id === fieldId);
    return found ? found.value : '';
  };

  const setFieldValue = (field: CustomField, raw: string) => {
    const next = raw;
    setValueDrafts((d) => ({ ...d, [field.id]: next }));
    setCustomValues((prev) => {
      const exists = prev.find((cv) => cv.field_id === field.id);
      if (exists) {
        return prev.map((cv) => (cv.field_id === field.id ? { ...cv, value: next } : cv));
      }
      return [ ...prev, { id: '', entity_type: 'plot', entity_id: plotId, field_id: field.id, value: next } ];
    });
  };

  const toggleBoolean = (field: CustomField) => {
    const current = getFieldValue(field.id) === '1';
    const next = !current;
    setValueDrafts((d) => ({ ...d, [field.id]: next ? '1' : '0' }));
    setCustomValues((prev) => {
      const exists = prev.find((cv) => cv.field_id === field.id);
      if (exists) {
        return prev.map((cv) => (cv.field_id === field.id ? { ...cv, value: next ? '1' : '0' } : cv));
      }
      return [ ...prev, { id: '', entity_type: 'plot', entity_id: plotId, field_id: field.id, value: next ? '1' : '0' } ];
    });
    setCustomValue('plot', plotId, field.id, next ? '1' : '0');
  };

  const commitField = (field: CustomField) => {
    setCustomValue('plot', plotId, field.id, getFieldValue(field.id));
  };

  const confirmDeletePayment = (pmt: PlotPayment) => {
    Alert.alert('حذف الدفعة', 'هل تريد حذف هذه الدفعة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          await deletePayment(pmt.id, plotId);
          load();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.bgCard, paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
          <Ionicons name="chevron-forward" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>تفاصيل القطعة</Text>
        <View style={styles.headerActions}>
          {editing ? (
            <TouchableOpacity
              onPress={() => {
                setEditing(false);
                load();
              }}
              style={styles.headerIcon}
            >
              <Text style={[styles.cancelText, { color: colors.error }]}>إلغاء</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setEditing(true)} style={styles.headerIcon}>
              <Ionicons name="pencil" size={20} color={colors.accent} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={confirmDelete} style={styles.headerIcon}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={styles.card}>
            <Input label="رقم القطعة" value={plotNo} onChangeText={setPlotNo} editable={editing} />
            <View style={styles.twoCol}>
              <View style={styles.twoColItem}>
                <Input
                  label="المساحة (م²)"
                  value={areaSqm}
                  onChangeText={setAreaSqm}
                  keyboardType="numeric"
                  editable={editing}
                />
              </View>
              <View style={styles.twoColItem}>
                <Input
                  label="قيمة القطعة (ريال يمني)"
                  value={value}
                  onChangeText={setValue}
                  keyboardType="numeric"
                  editable={editing}
                />
              </View>
            </View>

            <Text style={[styles.label, { color: colors.textPrimary }]}>الحالة</Text>
            <View style={styles.segRow}>
              {STATUS_OPTIONS.map((opt) => {
                const active = status === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => onStatusChange(opt.key)}
                    style={[styles.segItem, { backgroundColor: active ? opt.color : colors.bgSecondary, borderColor: active ? opt.color : colors.border }]}
                  >
                    <Text style={[styles.segText, { color: active ? '#ffffff' : colors.textSecondary }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>حدود الأرض</Text>
            <View style={styles.twoCol}>
              <View style={styles.twoColItem}>
                <Input label="الحد الشمالي" value={boundaryNorth} onChangeText={setBoundaryNorth} editable={editing} />
              </View>
              <View style={styles.twoColItem}>
                <Input label="الحد الجنوبي" value={boundarySouth} onChangeText={setBoundarySouth} editable={editing} />
              </View>
            </View>
            <View style={styles.twoCol}>
              <View style={styles.twoColItem}>
                <Input label="الحد الشرقي" value={boundaryEast} onChangeText={setBoundaryEast} editable={editing} />
              </View>
              <View style={styles.twoColItem}>
                <Input label="الحد الغربي" value={boundaryWest} onChangeText={setBoundaryWest} editable={editing} />
              </View>
            </View>
          </Card>

          {(status === 'sold' || status === 'installment') && (
            <Card style={styles.card}>
              <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>بيانات البيع</Text>
              <Input label="اسم المشتري" value={buyerName} onChangeText={setBuyerName} editable={editing} />
              <Input
                label="بيانات التواصل"
                value={buyerContact}
                onChangeText={setBuyerContact}
                placeholder="هاتف / وسائل تواصل"
                editable={editing}
              />

              {status === 'sold' && (
                <Input label="تاريخ إتمام البيع" value={saleDate} onChangeText={setSaleDate} placeholder="YYYY-MM-DD" editable={editing} />
              )}

              {status === 'installment' && (
                <View>
                  <Text style={[styles.label, { color: colors.textPrimary }]}>نوع القسط</Text>
                  <View style={styles.segRow}>
                    {INSTALLMENT_OPTIONS.map((opt) => {
                      const active = installmentType === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          onPress={() => setInstallmentType(opt.key === '' ? '' : opt.key as InstallmentType)}
                          style={[styles.segItem, { backgroundColor: active ? colors.accent : colors.bgSecondary, borderColor: active ? colors.accent : colors.border }]}
                        >
                          <Text style={[styles.segText, { color: active ? '#ffffff' : colors.textSecondary }]}>{opt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={styles.chipRow}>
                    <View style={[styles.chip, { backgroundColor: colors.accentSurface }]}>
                      <Text style={[styles.chipText, { color: colors.accent }]}>
                        المدفوع: {(plot?.paid_amount ?? 0).toLocaleString()} ر.ي
                      </Text>
                    </View>
                    <View style={[styles.chip, { backgroundColor: colors.warning + '22' }]}>
                      <Text style={[styles.chipText, { color: colors.warning }]}>
                        المتبقي: {(plot?.remaining_amount ?? 0).toLocaleString()} ر.ي
                      </Text>
                    </View>
                  </View>

                  <Button
                    title="تسجيل قسط جديد"
                    onPress={() => navigation.navigate('PaymentForm', { plotId })}
                    size="sm"
                    variant="primary"
                    icon={<Ionicons name="cash-outline" size={14} color="#FFF" />}
                  />
                </View>
              )}
            </Card>
          )}

          <Card style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>حقول مخصصة</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('CustomFields', { entityType: 'plot', entityId: plotId })}
                style={styles.manageBtn}
              >
                <Ionicons name="settings-outline" size={16} color={colors.accent} />
                <Text style={[styles.manageText, { color: colors.accent }]}>إدارة</Text>
              </TouchableOpacity>
            </View>

            {customFields.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد حقول مخصصة</Text>
            ) : (
              customFields.map((field) => {
                const valueTypeLabel =
                  field.value_type === 'text' ? 'نص'
                  : field.value_type === 'number' ? 'رقم'
                  : field.value_type === 'date' ? 'تاريخ'
                  : field.value_type === 'boolean' ? 'نعم-لا'
                  : 'اختيار من قائمة';
                return (
                  <View key={field.id} style={styles.customFieldRow}>
                    <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>{field.label}</Text>
                    <Text style={[styles.fieldTypeLabel, { color: colors.textMuted }]}>{valueTypeLabel}</Text>
                    {field.value_type === 'boolean' ? (
                      <View style={styles.segRow}>
                        {['1', '0'].map((b) => {
                          const active = getFieldValue(field.id) === b;
                          return (
                            <Pressable
                              key={b}
                              onPress={() => toggleBoolean(field)}
                              style={[styles.segItem, { backgroundColor: active ? colors.accent : colors.bgSecondary, borderColor: active ? colors.accent : colors.border }]}
                            >
                              <Text style={[styles.segText, { color: active ? '#ffffff' : colors.textSecondary }]}>
                                {b === '1' ? 'نعم' : 'لا'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : (
                      <Input
                        label="القيمة"
                        value={getFieldValue(field.id)}
                        onChangeText={(t) => setFieldValue(field, t)}
                        onEndEditing={() => commitField(field)}
                        keyboardType={field.value_type === 'number' ? 'numeric' : field.value_type === 'date' ? 'default' : 'default'}
                        placeholder={field.value_type === 'date' ? 'YYYY-MM-DD' : ''}
                      />
                    )}
                  </View>
                );
              })
            )}
          </Card>

          {(status === 'sold' || status === 'installment' || payments.length > 0) && (
            <Card style={styles.card}>
              <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>سجل المدفوعات</Text>
              {payments.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد مدفوعات مسجلة</Text>
              ) : (
                payments.map((pmt) => (
                  <View key={pmt.id} style={[styles.paymentRow, { borderBottomColor: colors.border }]}>
                    <View style={styles.flex}>
                      <Text style={[styles.paymentAmount, { color: colors.textPrimary }]}>
                        {Number(pmt.amount).toLocaleString()} ر.ي
                      </Text>
                      <Text style={[styles.paymentDate, { color: colors.textSecondary }]}>
                        {pmt.pay_date} · {PAYMENT_METHOD_LABELS[pmt.method] ?? pmt.method}
                      </Text>
                      {pmt.method === 'cash' ? (
                        <Text style={[styles.paymentMeta, { color: colors.textMuted }]}>
                          استلم: {pmt.cash_recipient} · سند: {pmt.cash_receipt_no}
                        </Text>
                      ) : (
                        <Text style={[styles.paymentMeta, { color: colors.textMuted }]}>
                          بنك: {pmt.bank_name} · مرجع: {pmt.bank_ref_no}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => confirmDeletePayment(pmt)}>
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </Card>
          )}

          {editing && (
            <Button title="حفظ التغييرات" onPress={handleSave} variant="primary" icon={<Ionicons name="checkmark" size={16} color="#FFF" />} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: fontSize.lg, fontFamily: 'Tajawal_700Bold' },
  headerIcon: { padding: spacing.xs },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  cancelText: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm },
  content: { padding: spacing.md, gap: spacing.md },
  card: { gap: spacing.md },
  twoCol: { flexDirection: 'row', gap: spacing.md },
  twoColItem: { flex: 1 },
  label: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm, marginBottom: spacing.xs },
  sectionHeader: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.md },
  segRow: { flexDirection: 'row', gap: spacing.sm },
  segItem: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segText: { fontFamily: 'Tajawal_500Medium', fontSize: fontSize.sm },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chip: { flex: 1, padding: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  chipText: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  manageBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  manageText: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm },
  emptyText: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.sm },
  customFieldRow: { gap: spacing.sm, borderBottomWidth: 1, paddingBottom: spacing.md },
  fieldLabel: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm },
  fieldTypeLabel: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.xs, marginTop: -spacing.xs },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  paymentAmount: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.md },
  paymentDate: { fontFamily: 'Tajawal_500Medium', fontSize: fontSize.sm, marginTop: 2 },
  paymentMeta: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.xs, marginTop: 2 },
});