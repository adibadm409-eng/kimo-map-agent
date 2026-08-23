export type ScreenRisk = 'low' | 'medium' | 'high' | 'critical'

export interface ScreenCatalogEntry {
  id: string
  route: string
  label: string
  purpose: string
  entities: string[]
  readTools: string[]
  writeTools: string[]
  safeEditPolicy: string
  risk: ScreenRisk
  verificationTools: string[]
  notes?: string[]
}

export const SCREEN_CATALOG: ScreenCatalogEntry[] = [
  {
    id: 'dashboard', route: 'Dashboard', label: 'لوحة التحكم', purpose: 'ملخص الحالة العامة والاختصارات إلى الأقسام.',
    entities: ['properties', 'clients', 'projects', 'plot_payments'], readTools: ['dashboard_kpis', 'data_snapshot', 'catalog'], writeTools: [],
    safeEditPolicy: 'شاشة قراءة؛ نفّذ التغيير في شاشة الكيان الأصلية ثم أعد تحميل المؤشرات.', risk: 'low', verificationTools: ['dashboard_kpis'],
  },
  {
    id: 'projects', route: 'ProjectsStack', label: 'المشاريع العقارية', purpose: 'إدارة المشاريع والبلوكات والقطع والأصول الهرمية.',
    entities: ['projects', 'project_profiles', 'project_nodes', 'blocks', 'plots', 'plot_payments'],
    readTools: ['project_profile_get', 'project_nodes_list', 'project_tree', 'project_integrity_check', 'catalog'],
    writeTools: ['project_import_preview', 'project_import_commit', 'ledger_record_payment', 'update', 'create'],
    safeEditPolicy: 'للاستيراد استخدم preview ثم commit؛ للمال استخدم ledger_record_payment؛ لا تعدل المجاميع المالية عبر update؛ بعد كل دفعة جماعية نفّذ integrity check.',
    risk: 'critical', verificationTools: ['project_integrity_check', 'project_cashflow', 'project_profile_get'],
    notes: ['يدعم land وresidential_building وtower وcompound وcustom.', 'العقد الهرمية لا تُعامل كلها كقطع أراضٍ.'],
  },
  {
    id: 'properties', route: 'PropertiesStack', label: 'العقارات', purpose: 'إدارة العقارات والوصف والموقع والحالة والنوع وصورة الأيقونة الاختيارية ومعرض الصور والفيديوهات وبيانات الدلال والبيانات المخصصة.',
    entities: ['properties', 'custom_fields', 'custom_field_values'], readTools: ['query', 'get', 'list_entities', 'catalog'], writeTools: ['create', 'update', 'custom_field_set'],
    safeEditPolicy: 'اقرأ السجل الحالي أولاً، اعرض الفرق المقترح، لا تستبدل حقولاً غير مذكورة، ميّز الدلال عن المالك، افصل media كمعرض مستقل عن icon_uri، ولا تنشئ أو تستبدل أي URI بالتخمين، ثم تحقق من وجود السجل بعد التعديل.', risk: 'high', verificationTools: ['get', 'query'],
  },
  {
    id: 'clients', route: 'ClientsStack', label: 'العملاء', purpose: 'إدارة بيانات العملاء والاتصالات وربطهم بالعمليات.',
    entities: ['clients'], readTools: ['query', 'get', 'search_everything', 'catalog'], writeTools: ['create', 'update'],
    safeEditPolicy: 'لا تدمج أو تحذف سجلات متشابهة تلقائياً؛ اعرض المرشحين واطلب قراراً صريحاً قبل الدمج أو الحذف.', risk: 'high', verificationTools: ['get', 'query'],
  },
  {
    id: 'marketing', route: 'MarketingStack', label: 'التسويق والعروض', purpose: 'العروض والحملات والمشاهدات ونقاط المسار مع مؤقتات تنبيه محلية مرتبطة بالعروض.',
    entities: ['offers', 'reminders', 'campaigns', 'viewings', 'waypoints', 'areas'], readTools: ['query', 'get', 'catalog', 'current_local_time', 'list_reminders', 'list_offer_reminders'], writeTools: ['create', 'update', 'delete', 'create_offer_with_reminder', 'offer_reminder_set', 'create_reminder', 'cancel_reminder'],
    safeEditPolicy: 'التنبيهات كيان محلي مستقل وقد ترتبط بعرض أو عقار أو عميل أو معاينة أو مشروع أو دفعة أو تكون عامة. عند تعديل حملة أو عرض، تحقق من الروابط والمدة والحالة؛ الحذف يحتاج معاينة وموافقة. اقرأ الوقت المحلي أولاً، تحقق من الموعد والهدف، ثم أعد قراءة التنبيه بعد الحفظ.', risk: 'medium', verificationTools: ['get', 'query', 'list_reminders', 'audit_log_query'],
  },
  {
    id: 'reminders', route: 'Reminders', label: 'التذكيرات', purpose: 'إدارة التذكيرات والإشعارات المحلية القادمة التي تعمل دون اتصال أو خادم.',
    entities: ['reminders', 'offers', 'properties', 'clients', 'viewings', 'projects', 'plot_payments'], readTools: ['list_reminders', 'list_offer_reminders', 'get', 'current_local_time'], writeTools: ['create_reminder', 'offer_reminder_set', 'cancel_reminder'],
    safeEditPolicy: 'التنبيه كيان محلي مستقل ويمكن أن يكون عاماً أو مرتبطاً بعرض أو عقار أو عميل أو معاينة أو مشروع أو دفعة. لا تنشئه دون نص وموعد مستقبلي واضح؛ تحقق من target_type وtarget_id، واعرض القائمة قبل الإلغاء عند غياب معرف واضح.', risk: 'medium', verificationTools: ['list_reminders', 'list_offer_reminders', 'get'],
  },
  {
    id: 'reports', route: 'Reports', label: 'التقارير', purpose: 'تقارير المشاريع والمال والتصدير.',
    entities: ['projects', 'plots', 'plot_payments', 'project_nodes'], readTools: ['project_financials', 'project_cashflow', 'project_tree', 'project_integrity_check'], writeTools: ['generate_file'],
    safeEditPolicy: 'التقارير قراءة مشتقة؛ لا تُعدّل المصدر منها، وأظهر النطاق والفترة والعملة وحالة البيانات.', risk: 'medium', verificationTools: ['project_integrity_check', 'project_cashflow'],
  },
  {
    id: 'workspaces', route: 'WorkspaceStack', label: 'مساحات العمل', purpose: 'جداول حرة للبيانات التي لا تناسب كيانات التطبيق.',
    entities: ['workspaces', 'workspace_tables', 'workspace_rows', 'workspace_attachments'], readTools: ['list_workspaces', 'workspace_get', 'read_uploaded_file'], writeTools: ['workspace_create', 'workspace_import_rows', 'workspace_update_row', 'workspace_delete'],
    safeEditPolicy: 'استخدمها للبيانات الحرة فقط؛ عاين الأعمدة والصفوف، امنع التكرار، واذكر للمستخدم أنها ليست مشروعاً عقارياً رسمياً.', risk: 'high', verificationTools: ['workspace_get', 'audit_log_query'],
  },
  {
    id: 'assistant', route: 'Assistant', label: 'كيمو', purpose: 'فهم الطلب والتخطيط والتنفيذ الموجه مع سجل مرئي.',
    entities: ['agent_sessions', 'agent_messages', 'agent_runtime_events', 'agent_undo'], readTools: ['catalog', 'list_entities', 'data_snapshot', 'audit_log_query'], writeTools: ['execute', 'request_confirmation', 'ask_user', 'undo_last'],
    safeEditPolicy: 'ابدأ بالقراءة، اعرض الخطة، اسأل عن الغموض، اطلب الموافقة على العمليات الحساسة، ثم نفّذ وتحقق وسجّل الأثر.', risk: 'critical', verificationTools: ['audit_log_query', 'review_my_work'],
  },
  {
    id: 'settings', route: 'Settings', label: 'الإعدادات والنسخ', purpose: 'إعدادات التطبيق المحلي والنسخ والاستعادة ومفاتيح المزودات.',
    entities: ['agent_settings', 'map_provider_settings', 'backups'], readTools: ['catalog', 'list_generated_files'], writeTools: ['generate_file'],
    safeEditPolicy: 'المفاتيح تُحفظ في SecureStore، والنسخ التي تتضمن أسراراً مشفرة بكلمة مرور؛ لا تعرض أو تسجل قيمة المفتاح.', risk: 'critical', verificationTools: ['audit_log_query'],
  },
]

export function getScreenCatalog(screenId?: string): ScreenCatalogEntry[] {
  if (!screenId) return SCREEN_CATALOG
  const needle = screenId.toLowerCase()
  return SCREEN_CATALOG.filter((screen) => screen.id === needle || screen.route.toLowerCase() === needle || screen.label.includes(screenId))
}

export function screenCatalogSummary(): string {
  return SCREEN_CATALOG.map((screen) => `${screen.label} (${screen.route}): ${screen.entities.join(', ')}`).join('\n')
}
