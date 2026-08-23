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
import {
  getCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  getCustomValues,
  setCustomValue,
} from '../../database/projects';
import type { EntityType, CustomField, CustomFieldValue, FieldValueType } from '../../database/projects';

const ENTITY_TITLES: Record<EntityType, string> = {
  project: 'حقول مخصصة للمشروع',
  block: 'حقول مخصصة للبلوك',
  plot: 'حقول مخصصة للفطعة',
};

const VALUE_TYPE_OPTIONS: { key: FieldValueType; label: string }[] = [
  { key: 'text', label: 'نص' },
  { key: 'number', label: 'رقم' },
  { key: 'date', label: 'تاريخ' },
  { key: 'boolean', label: 'نعم-لا' },
  { key: 'select', label: 'اختيار من قائمة' },
];

const VALUE_TYPE_LABELS: Record<FieldValueType, string> = {
  text: 'نص',
  number: 'رقم',
  date: 'تاريخ',
  boolean: 'نعم-لا',
  select: 'اختيار من قائمة',
};

type RouteParams = { entityType: EntityType; entityId: string };

export default function CustomFields() {
  const navigation = useNavigation();
  const route = useRoute();
  const { entityType, entityId } = (route.params as RouteParams) ?? { entityType: 'plot', entityId: '' };
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [fields, setFields] = useState<CustomField[]>([]);
  const [values, setValues] = useState<CustomFieldValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const [label, setLabel] = useState('');
  const [valueType, setValueType] = useState<FieldValueType>('text');
  const [options, setOptions] = useState('');
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const cf = await getCustomFields(entityType);
    setFields(cf);
    const cv = await getCustomValues(entityType, entityId);
    setValues(cv);
    setValueDrafts({});
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const getFieldValue = (fieldId: string) => {
    if (valueDrafts[fieldId] !== undefined) return valueDrafts[fieldId];
    const found = values.find((v) => v.field_id === fieldId);
    return found ? found.value : '';
  };

  const setFieldDraft = (fieldId: string, raw: string) => {
    setValueDrafts((d) => ({ ...d, [fieldId]: raw }));
    setValues((prev) => {
      const exists = prev.find((v) => v.field_id === fieldId);
      if (exists) {
        return prev.map((v) => (v.field_id === fieldId ? { ...v, value: raw } : v));
      }
      return [{ id: '', entity_type: entityType, entity_id: entityId, field_id: fieldId, value: raw }, ...prev];
    });
  };

  const commitValue = (fieldId: string) => {
    setCustomValue(entityType, entityId, fieldId, getFieldValue(fieldId));
  };

  const toggleBoolean = (fieldId: string) => {
    const current = getFieldValue(fieldId) === '1';
    const next = !current;
    setValueDrafts((d) => ({ ...d, [fieldId]: next ? '1' : '0' }));
    setValues((prev) => {
      const exists = prev.find((v) => v.field_id === fieldId);
      if (exists) {
        return prev.map((v) => (v.field_id === fieldId ? { ...v, value: next ? '1' : '0' } : v));
      }
      return [{ id: '', entity_type: entityType, entity_id: entityId, field_id: fieldId, value: next ? '1' : '0' }, ...prev];
    });
    setCustomValue(entityType, entityId, fieldId, next ? '1' : '0');
  };

  const confirmDelete = (field: CustomField) => {
    Alert.alert('حذف الحقل', `هل تريد حذف الحقل "${field.label}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          await deleteCustomField(field.id);
          await load();
        },
      },
    ]);
  };

  const handleAdd = async () => {
    if (!label.trim()) {
      Alert.alert('خطأ', 'أدخل اسم الحقل');
      return;
    }
    setAdding(true);
    await createCustomField({
      entity_type: entityType,
      label: label.trim(),
      value_type: valueType,
      options: valueType === 'select' ? options : undefined,
    });
    setAdding(false);
    setLabel('');
    setOptions('');
    setValueType('text');
    await load();
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{ENTITY_TITLES[entityType]}</Text>
        <View style={styles.headerSpace} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>الحقول الموجودة</Text>
              <Text style={[styles.countText, { color: colors.textMuted }]}>{fields.length} حقول</Text>
            </View>

            {fields.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>لا توجد حقول مخصصة بعد</Text>
            ) : (
              fields.map((field) => (
                <View key={field.id} style={[styles.fieldBlock, { borderBottomColor: colors.border }]}>
                  <View style={styles.rowBetween}>
                    <View style={styles.flex}>
                      <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>{field.label}</Text>
                      <Text style={[styles.fieldTypeLabel, { color: colors.textMuted }]}>
                        {VALUE_TYPE_LABELS[field.value_type]}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => confirmDelete(field)}>
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>

                  {field.value_type === 'boolean' ? (
                    <View style={styles.segRow}>
                      {['1', '0'].map((b) => {
                        const active = getFieldValue(field.id) === b;
                        return (
                          <Pressable
                            key={b}
                            onPress={() => toggleBoolean(field.id)}
                            style={[styles.segItem, { backgroundColor: active ? colors.accent : colors.bgSecondary, borderColor: active ? colors.accent : colors.border }]}
                          >
                            <Text style={[styles.segText, { color: active ? '#ffffff' : colors.textSecondary }]}>
                              {b === '1' ? 'نعم' : 'لا'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : field.value_type === 'select' ? (
                    <View>
                      <Input
                        label="القيمة"
                        value={getFieldValue(field.id)}
                        onChangeText={(t) => setFieldDraft(field.id, t)}
                        onEndEditing={() => commitValue(field.id)}
                      />
                      {field.options ? (
                        <View style={styles.optionWrap}>
                          <Text style={[styles.optionHint, { color: colors.textMuted }]}>الخيارات المتاحة:</Text>
                          <View style={styles.optionRow}>
                            {field.options
                              .split(',')
                              .map((o) => o.trim())
                              .filter((o) => o !== '')
                              .map((o) => {
                                const active = getFieldValue(field.id) === o;
                                return (
                                  <Pressable
                                    key={o}
                                    onPress={() => {
                                      setFieldDraft(field.id, o);
                                      commitValue(field.id);
                                    }}
                                    style={[styles.optionChip, { backgroundColor: active ? colors.accentSurface : colors.bgSecondary, borderColor: active ? colors.accent : colors.border }]}
                                  >
                                    <Text style={[styles.optionChipText, { color: active ? colors.accent : colors.textSecondary }]}>{o}</Text>
                                  </Pressable>
                                );
                              })}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <Input
                      label="القيمة"
                      value={getFieldValue(field.id)}
                      onChangeText={(t) => setFieldDraft(field.id, t)}
                      onEndEditing={() => commitValue(field.id)}
                      keyboardType={field.value_type === 'number' ? 'numeric' : 'default'}
                      placeholder={field.value_type === 'date' ? 'YYYY-MM-DD' : ''}
                    />
                  )}
                </View>
              ))
            )}
          </Card>

          <Card style={styles.card}>
            <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>إضافة حقل جديد</Text>
            <Input label="اسم الحقل" value={label} onChangeText={setLabel} />

            <Text style={[styles.label, { color: colors.textPrimary }]}>النوع</Text>
            <View style={styles.segRow}>
              {VALUE_TYPE_OPTIONS.map((opt) => {
                const active = valueType === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setValueType(opt.key)}
                    style={[styles.segItem, { backgroundColor: active ? colors.accent : colors.bgSecondary, borderColor: active ? colors.accent : colors.border }]}
                  >
                    <Text style={[styles.segText, { color: active ? '#ffffff' : colors.textSecondary }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {valueType === 'select' && (
              <Input
                label="الخيارات (مفصولة بفاصلة)"
                value={options}
                onChangeText={setOptions}
                placeholder="a,b,c"
              />
            )}

            <Button
              title={adding ? 'جارٍ الإضافة...' : 'إضافة'}
              onPress={handleAdd}
              variant="primary"
              icon={<Ionicons name="add" size={16} color="#FFF" />}
              disabled={adding}
            />
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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.lg,
    fontFamily: 'Tajawal_700Bold',
  },
  headerIcon: { padding: spacing.xs },
  headerSpace: { width: 32 },
  content: { padding: spacing.md, gap: spacing.md },
  card: { gap: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeader: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.md },
  countText: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.sm },
  emptyText: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.sm },
  fieldBlock: { gap: spacing.sm, borderBottomWidth: 1, paddingBottom: spacing.md },
  fieldLabel: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm },
  fieldTypeLabel: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.xs },
  label: { fontFamily: 'Tajawal_700Bold', fontSize: fontSize.sm, marginBottom: spacing.xs },
  segRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  segItem: {
    flex: 1,
    minWidth: 90,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segText: { fontFamily: 'Tajawal_500Medium', fontSize: fontSize.sm },
  optionWrap: { gap: spacing.xs },
  optionHint: { fontFamily: 'Tajawal_400Regular', fontSize: fontSize.xs },
  optionRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  optionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  optionChipText: { fontFamily: 'Tajawal_500Medium', fontSize: fontSize.sm },
});