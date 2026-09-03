import React, { useCallback, useEffect, useState } from 'react';
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
  getPaymentsByPlot,
  recordPayment,
  deletePayment,
  PAYMENT_METHOD_LABELS,
} from '../../database/projects';
import type { Plot, PlotPayment, PaymentMethod } from '../../database/projects';

const METHOD_OPTIONS: { key: PaymentMethod; label: string }[] = [
  { key: 'cash', label: 'كاش' },
  { key: 'bank', label: 'بنكي' },
];

type RouteParams = { plotId: string };

export default function PaymentForm() {
  const navigation = useNavigation();
  const route = useRoute();
  const { plotId } = (route.params as RouteParams) ?? { plotId: '' };
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [plot, setPlot] = useState<Plot | null>(null);
  const [payments, setPayments] = useState<PlotPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [recipient, setRecipient] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankRef, setBankRef] = useState('');

  const load = useCallback(async () => {
    const p = await getPlot(plotId);
    setPlot(p);
    const pays = await getPaymentsByPlot(plotId);
    setPayments(pays);
    setLoading(false);
  }, [plotId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      Alert.alert('خطأ', 'أدخل قيمة صحيحة للقسط');
      return;
    }
    if (method === 'cash' && (!recipient.trim() || !receiptNo.trim())) {
      Alert.alert('خطأ', 'أدخل اسم المستلم ورقم السند');
      return;
    }
    if (method === 'bank' && (!bankName.trim() || !bankRef.trim())) {
      Alert.alert('خطأ', 'أدخل اسم البنك والرقم المرجعي');
      return;
    }

    setSaving(true);
    await recordPayment(plotId, {
      amount: amt,
      pay_date: payDate || new Date().toISOString().slice(0, 10),
      method,
      cash_recipient: method === 'cash' ? recipient.trim() : undefined,
      cash_receipt_no: method === 'cash' ? receiptNo.trim() : undefined,
      bank_name: method === 'bank' ? bankName.trim() : undefined,
      bank_ref_no: method === 'bank' ? bankRef.trim() : undefined,
    });
    setSaving(false);
    Alert.alert('تم', 'تم تسجيل القسط');
    setAmount('');
    setRecipient('');
    setReceiptNo('');
    setBankName('');
    setBankRef('');
    await load();
  };

  const confirmDeletePayment = (pmt: PlotPayment) => {
    Alert.alert('حذف الدفعة', 'هل تريد حذف هذه الدفعة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          await deletePayment(pmt.id, plotId);
          await load();
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>تسجيل قسط</Text>
        <View style={styles.headerSpace} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={styles.card}>
            <View style={styles.chipRow}>
              <View style={[styles.chip, { backgroundColor: colors.warning + '22' }]}>
                <Text style={[styles.chipText, { color: colors.warning }]}>
                  المتبقي الحالي: {(plot?.remaining_amount ?? 0).toLocaleString()} ر.ي
                </Text>
              </View>
              <View style={[styles.chip, { backgroundColor: colors.accentSurface }]}>
                <Text style={[styles.chipText, { color: colors.accent }]}>
                  الإجمالي: {(plot?.value ?? 0).toLocaleString()} ر.ي
                </Text>
              </View>
            </View>

            <Input
              label="القيمة المدفوعة"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0.00"
            />
            <Input
              label="تاريخ الدفعة"
              value={payDate}
              onChangeText={setPayDate}
              placeholder="YYYY-MM-DD"
            />

            <Text style={[styles.label, { color: colors.textPrimary }]}>وسيلة الدفع</Text>
            <View style={styles.segRow}>
              {METHOD_OPTIONS.map((opt) => {
                const active = method === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setMethod(opt.key)}
                    style={[styles.segItem, { backgroundColor: active ? colors.accent : colors.bgSecondary, borderColor: active ? colors.accent : colors.border }]}
                  >
                    <Text style={[styles.segText, { color: active ? '#ffffff' : colors.textSecondary }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {method === 'cash' && (
              <View style={styles.conditional}>
                <SuggestField label="اسم المستلم" value={recipient} onChange={setRecipient} field="name" placeholder="اسم المستلم" onPick={(c) => { if (c.name) setRecipient(c.name) }} />
                <Input label="رقم السند" value={receiptNo} onChangeText={setReceiptNo} />
              </View>
            )}

            {method === 'bank' && (
              <View style={styles.conditional}>
                <Input label="اسم البنك" value={bankName} onChangeText={setBankName} />
                <Input label="الرقم المرجعي للسند/الحوالة" value={bankRef} onChangeText={setBankRef} />
              </View>
            )}

            <Button
              title={saving ? 'جارٍ الحفظ...' : 'تسجيل الدفعة'}
              onPress={handleSave}
              variant="primary"
              icon={<Ionicons name="cash-outline" size={16} color="#FFF" />}
              disabled={saving}
            />
          </Card>

          <Card style={styles.card}>
            <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>آخر المدفوعات</Text>
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
  headerSpace: { width: 32 },
  content: { padding: spacing.md, gap: spacing.md },
  card: { gap: spacing.md },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chip: { flex: 1, padding: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  chipText: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm },
  label: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm, marginBottom: spacing.xs },
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
  conditional: { gap: spacing.md },
  sectionHeader: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.md },
  emptyText: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.sm },
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