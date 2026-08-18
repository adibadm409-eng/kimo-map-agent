import * as SQLite from 'expo-sqlite'
import { Platform } from 'react-native'
import type { Property, Client, Offer, Campaign, Viewing, OfferReminder } from '../types'
import { logChange } from './audit'
import { cancelLocalReminder, cancelOfferReminder, scheduleLocalReminder, scheduleOfferReminder } from '../notifications/offerReminders'

const DB_NAME = 'realestate.db'

let db: SQLite.SQLiteDatabase | null = null

export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db
  db = await SQLite.openDatabaseAsync(DB_NAME)
  await initSchema(db)
  return db
}

async function safeMigrate(database: SQLite.SQLiteDatabase) {
  const addColumnIfMissing = async (table: string, column: string, definition: string) => {
    try {
      await database.runAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    } catch (e) {
      // Column already exists - safe to ignore
    }
  }
  await addColumnIfMissing("waypoints", "category", "TEXT DEFAULT 'general'")
  await addColumnIfMissing("waypoints", "tags", "TEXT DEFAULT '[]'")
  await addColumnIfMissing("waypoints", "rating", "REAL DEFAULT 0")
  await addColumnIfMissing("waypoints", "owner_name", "TEXT DEFAULT ''")
  await addColumnIfMissing("waypoints", "owner_phone", "TEXT DEFAULT ''")
  await addColumnIfMissing("waypoints", "owner_contact", "TEXT DEFAULT ''")
  await addColumnIfMissing("waypoints", "property_details", "TEXT DEFAULT ''")
  await addColumnIfMissing("waypoints", "area_sqm", "REAL DEFAULT 0")
  await addColumnIfMissing("waypoints", "price", "REAL DEFAULT 0")
  await addColumnIfMissing("waypoints", "listing_date", "TEXT DEFAULT ''")
  await addColumnIfMissing("waypoints", "media_kind", "TEXT DEFAULT 'photo'")
  await addColumnIfMissing("waypoints", "media_count", "INTEGER DEFAULT 0")
  await addColumnIfMissing("areas", "category", "TEXT DEFAULT 'general'")
  await addColumnIfMissing("areas", "tags", "TEXT DEFAULT '[]'")
  await addColumnIfMissing("areas", "rating", "REAL DEFAULT 0")
  await addColumnIfMissing("properties", "geojson", "TEXT DEFAULT ''")
  await addColumnIfMissing("properties", "category", "TEXT DEFAULT 'general'")
  await addColumnIfMissing("properties", "area_sqm", "REAL DEFAULT 0")
  await addColumnIfMissing("properties", "icon_uri", "TEXT DEFAULT ''")
  await addColumnIfMissing("properties", "broker_name", "TEXT DEFAULT ''")
  await addColumnIfMissing("properties", "broker_phone", "TEXT DEFAULT ''")
  await addColumnIfMissing("properties", "media", "TEXT DEFAULT '[]'")
  await addColumnIfMissing("offers", "reminder_at", "TEXT DEFAULT ''")
  await addColumnIfMissing("offers", "reminder_notification_id", "TEXT DEFAULT ''")
  await addColumnIfMissing("offers", "media", "TEXT DEFAULT '[]'")
  await addColumnIfMissing("reminders", "target_type", "TEXT DEFAULT 'general'")
  await addColumnIfMissing("reminders", "target_id", "TEXT DEFAULT ''")
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS offer_reminders (
      id TEXT PRIMARY KEY,
      offer_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      remind_at TEXT NOT NULL,
      notification_id TEXT DEFAULT '',
      status TEXT DEFAULT 'scheduled',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (offer_id) REFERENCES offers (id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_offer_reminders_offer ON offer_reminders (offer_id, status);
    CREATE INDEX IF NOT EXISTS idx_offer_reminders_time ON offer_reminders (remind_at, status);
    INSERT OR IGNORE INTO offer_reminders (id, offer_id, title, body, remind_at, notification_id, status)
      SELECT 'legacy-' || id, id, 'متابعة العرض', '', reminder_at, reminder_notification_id, 'scheduled'
      FROM offers
      WHERE COALESCE(reminder_at, '') <> '' AND COALESCE(reminder_notification_id, '') <> ''
        AND NOT EXISTS (SELECT 1 FROM offer_reminders r WHERE r.offer_id = offers.id);
    INSERT OR IGNORE INTO reminders (id, title, body, remind_at, notification_id, status, target_type, target_id, created_at)
      SELECT r.id, r.title, r.body, r.remind_at, r.notification_id, r.status, 'offer', r.offer_id, r.created_at
      FROM offer_reminders r
      WHERE NOT EXISTS (SELECT 1 FROM reminders existing WHERE existing.id = r.id);
  `)
  await ensureOfferPropertyOptional(database)
  await ensureOfferClientOptional(database)
}

async function ensureOfferClientOptional(database: SQLite.SQLiteDatabase): Promise<void> {
  const table = await database.getFirstAsync<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'offers'")
  if (!table?.sql) return
  const needsMigration = /client_id\s+TEXT\s+NOT\s+NULL/i.test(table.sql)
    || /FOREIGN\s+KEY\s*\(\s*client_id\s*\).*ON\s+DELETE\s+CASCADE/i.test(table.sql)
  if (!needsMigration) return
  await database.execAsync(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE offers_client_migrated (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      client_id TEXT,
      type TEXT DEFAULT 'buy_offer',
      amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      reminder_at TEXT DEFAULT '',
      reminder_notification_id TEXT DEFAULT '',
      media TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
    );
    INSERT INTO offers_client_migrated (id, property_id, client_id, type, amount, status, date, notes, reminder_at, reminder_notification_id, media, created_at)
      SELECT id, NULLIF(property_id, ''), NULLIF(client_id, ''), type, amount, status, date, notes, COALESCE(reminder_at, ''), COALESCE(reminder_notification_id, ''), COALESCE(media, '[]'), created_at FROM offers;
    DROP TABLE offers;
    ALTER TABLE offers_client_migrated RENAME TO offers;
    CREATE INDEX IF NOT EXISTS idx_offers_property ON offers (property_id);
    CREATE INDEX IF NOT EXISTS idx_offers_client ON offers (client_id);
    PRAGMA foreign_keys = ON;
  `)
}

async function ensureOfferPropertyOptional(database: SQLite.SQLiteDatabase): Promise<void> {
  const table = await database.getFirstAsync<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'offers'")
  if (!table?.sql || !/property_id\s+TEXT\s+NOT NULL/i.test(table.sql)) return
  await database.execAsync(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE offers_migrated (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      client_id TEXT NOT NULL,
      type TEXT DEFAULT 'buy_offer',
      amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      reminder_at TEXT DEFAULT '',
      reminder_notification_id TEXT DEFAULT '',
      media TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
    );
    INSERT INTO offers_migrated (id, property_id, client_id, type, amount, status, date, notes, reminder_at, reminder_notification_id, media, created_at)
      SELECT id, NULLIF(property_id, ''), client_id, type, amount, status, date, notes, COALESCE(reminder_at, ''), COALESCE(reminder_notification_id, ''), COALESCE(media, '[]'), created_at FROM offers;
    DROP TABLE offers;
    ALTER TABLE offers_migrated RENAME TO offers;
    CREATE INDEX IF NOT EXISTS idx_offers_property ON offers (property_id);
    CREATE INDEX IF NOT EXISTS idx_offers_client ON offers (client_id);
    PRAGMA foreign_keys = ON;
  `)
}

async function initSchema(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL DEFAULT 0,
      area REAL DEFAULT 0,
      latitude REAL DEFAULT 0,
      longitude REAL DEFAULT 0,
      address TEXT DEFAULT '',
      status TEXT DEFAULT 'for_sale',
      type TEXT DEFAULT 'apartment',
      owner_name TEXT DEFAULT '',
      owner_phone TEXT DEFAULT '',
      owner_email TEXT DEFAULT '',
      broker_name TEXT DEFAULT '',
      broker_phone TEXT DEFAULT '',
      icon_uri TEXT DEFAULT '',
      media TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      type TEXT DEFAULT 'buyer',
      notes TEXT DEFAULT '',
      budget_min REAL DEFAULT 0,
      budget_max REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      property_id TEXT,
      client_id TEXT,
      type TEXT DEFAULT 'buy_offer',
      amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      reminder_at TEXT DEFAULT '',
      reminder_notification_id TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS entity_media (
      id TEXT PRIMARY KEY,
      source_attachment_id TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('property', 'offer')),
      entity_id TEXT NOT NULL,
      name TEXT NOT NULL,
      uri TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      mime TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      UNIQUE(source_attachment_id, entity_type, entity_id)
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      remind_at TEXT NOT NULL,
      notification_id TEXT DEFAULT '',
      status TEXT DEFAULT 'scheduled',
      target_type TEXT DEFAULT 'general',
      target_id TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS offer_reminders (
      id TEXT PRIMARY KEY,
      offer_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      remind_at TEXT NOT NULL,
      notification_id TEXT DEFAULT '',
      status TEXT DEFAULT 'scheduled',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (offer_id) REFERENCES offers (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      type TEXT DEFAULT 'social_media',
      status TEXT DEFAULT 'draft',
      budget REAL DEFAULT 0,
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS viewings (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      date_time TEXT NOT NULL,
      status TEXT DEFAULT 'scheduled',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_entity_media_target ON entity_media (entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_entity_media_source ON entity_media (source_attachment_id);
    CREATE INDEX IF NOT EXISTS idx_offers_property ON offers (property_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders (status);
    CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders (remind_at);
    CREATE INDEX IF NOT EXISTS idx_reminders_target ON reminders (target_type, target_id, status);
    CREATE INDEX IF NOT EXISTS idx_offer_reminders_offer ON offer_reminders (offer_id, status);
    CREATE INDEX IF NOT EXISTS idx_offer_reminders_time ON offer_reminders (remind_at, status);
    CREATE INDEX IF NOT EXISTS idx_offers_client ON offers (client_id);
    CREATE INDEX IF NOT EXISTS idx_viewings_property ON viewings (property_id);
    CREATE INDEX IF NOT EXISTS idx_viewings_client ON viewings (client_id);
    CREATE INDEX IF NOT EXISTS idx_properties_status ON properties (status);
    CREATE INDEX IF NOT EXISTS idx_properties_type ON properties (type);
    CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties (owner_name);
    CREATE INDEX IF NOT EXISTS idx_properties_broker ON properties (broker_name);
    CREATE INDEX IF NOT EXISTS idx_clients_type ON clients (type);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
    CREATE INDEX IF NOT EXISTS idx_viewings_date ON viewings (date_time);
    CREATE INDEX IF NOT EXISTS idx_offers_status ON offers (status);
    CREATE INDEX IF NOT EXISTS idx_properties_created ON properties (created_at);
    CREATE INDEX IF NOT EXISTS idx_properties_price ON properties (price);
    CREATE INDEX IF NOT EXISTS idx_clients_created ON clients (created_at);
    CREATE INDEX IF NOT EXISTS idx_offers_created ON offers (created_at);
    CREATE INDEX IF NOT EXISTS idx_offers_date ON offers (date);
    CREATE INDEX IF NOT EXISTS idx_offers_amount ON offers (amount);
    CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns (created_at);
    CREATE INDEX IF NOT EXISTS idx_viewings_created ON viewings (created_at);

    CREATE TABLE IF NOT EXISTS waypoints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      type TEXT DEFAULT 'custom',
      media TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS areas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      geojson TEXT NOT NULL,
      area_sqm REAL DEFAULT 0,
      perimeter_m REAL DEFAULT 0,
      media TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_waypoints_coords ON waypoints (latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_areas_name ON areas (name);
    CREATE INDEX IF NOT EXISTS idx_waypoints_created ON waypoints (created_at);
    CREATE INDEX IF NOT EXISTS idx_areas_created ON areas (created_at);

    CREATE TABLE IF NOT EXISTS change_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'system',
      session_id TEXT,
      tool TEXT,
      before TEXT,
      after TEXT,
      summary TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_change_log_created ON change_log (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_change_log_scope ON change_log (scope, scope_id);
    CREATE INDEX IF NOT EXISTS idx_change_log_action ON change_log (action);
    CREATE INDEX IF NOT EXISTS idx_change_log_session ON change_log (session_id);
  `)

  await safeMigrate(database)
  await removeLegacyDemoData(database)
}

async function removeLegacyDemoData(database: SQLite.SQLiteDatabase): Promise<void> {
  const demoPropertyNames = ['فيلا النرجس الفاخرة', 'شقة الملقا العصرية', 'أرض الياسمين الاستثمارية', 'مكتب العليا المتميز', 'محل تجاري في الواحة']
  const demoClientPhones = ['0551112233', '0552223344', '0553334455', '0554445566']
  const demoCampaignNames = ['حملة إنستغرام العقارية', 'رسائل بريد عملاء']
  await database.withTransactionAsync(async () => {
    const propertyRows = await database.getAllAsync<{ id: string }>(
      `SELECT id FROM properties WHERE name IN (${demoPropertyNames.map(() => '?').join(', ')})`,
      demoPropertyNames,
    )
    const propertyIds = propertyRows.map((row) => row.id)
    if (propertyIds.length > 0) {
      const placeholders = propertyIds.map(() => '?').join(', ')
      await database.runAsync(`DELETE FROM offers WHERE property_id IN (${placeholders})`, propertyIds)
      await database.runAsync(`DELETE FROM viewings WHERE property_id IN (${placeholders})`, propertyIds)
      await database.runAsync(`DELETE FROM properties WHERE id IN (${placeholders})`, propertyIds)
    }
    await database.runAsync(
      `DELETE FROM clients WHERE phone IN (${demoClientPhones.map(() => '?').join(', ')})`,
      demoClientPhones,
    )
    await database.runAsync(
      `DELETE FROM campaigns WHERE name IN (${demoCampaignNames.map(() => '?').join(', ')})`,
      demoCampaignNames,
    )
  })
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/* No demo records are inserted on first launch. */

// CRUD helpers - PROPERTY
export async function getAllProperties(): Promise<any[]> {
  const db = await getDB()
  const rows = await db.getAllAsync('SELECT * FROM properties ORDER BY created_at DESC')
  return rows as any[]
}

export async function getProperty(id: string): Promise<any | null> {
  const db = await getDB()
  return await db.getFirstAsync('SELECT * FROM properties WHERE id = ?', [id])
}

export async function createProperty(p: Partial<Property>): Promise<string> {
  const db = await getDB()
  const id = genId()
  const area = p.area ?? (p as any).area_sqm ?? 0
  const areaSqm = (p as any).area_sqm ?? p.area ?? 0
  await db.runAsync(
          'INSERT INTO properties (id,name,description,price,area,latitude,longitude,address,status,type,owner_name,owner_phone,owner_email,broker_name,broker_phone,icon_uri,media,geojson,category,area_sqm) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id, p.name || '', p.description || '', p.price || 0, area, p.latitude || 0, p.longitude || 0, p.address || '', p.status || 'for_sale', p.type || 'apartment', p.owner_name || '', p.owner_phone || '', p.owner_email || '', (p as any).broker_name || '', (p as any).broker_phone || '', (p as any).icon_uri || '', (p as any).media || '[]', (p as any).geojson || '', (p as any).category || 'general', areaSqm]

  )
  await logChange({ action: 'create', scope: 'properties', scopeId: id, after: p, summary: `إنشاء عقار "${p.name || ''}"` })
  return id
}

export async function updateProperty(id: string, p: Partial<Property>): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM properties WHERE id = ?', [id])
  if (!before) throw new Error(`العقار (${id}) غير موجود.`)
  const allowed = new Set(['name', 'description', 'price', 'area', 'latitude', 'longitude', 'address', 'status', 'type', 'owner_name', 'owner_phone', 'owner_email', 'broker_name', 'broker_phone', 'icon_uri', 'media', 'geojson', 'category', 'area_sqm'
])
  const normalized = { ...p } as Record<string, any>
  if (normalized.area == null && normalized.area_sqm != null) normalized.area = normalized.area_sqm
  if (normalized.area_sqm == null && normalized.area != null) normalized.area_sqm = normalized.area
  const entries = Object.entries(normalized).filter(([key]) => allowed.has(key))
  if (!entries.length) return
  await db.runAsync(`UPDATE properties SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`, [...entries.map(([, value]) => value), id])
  await logChange({ action: 'update', scope: 'properties', scopeId: id, before, after: Object.fromEntries(entries), summary: `تعديل عقار (${id})` })
}

export async function deleteProperty(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM properties WHERE id = ?', [id])
  if (!before) throw new Error(`العقار (${id}) غير موجود.`)
  await db.runAsync('DELETE FROM properties WHERE id = ?', [id])
  await logChange({ action: 'delete', scope: 'properties', scopeId: id, before, summary: `حذف عقار (${id})` })
}

// CRUD helpers - CLIENT
export async function getAllClients(): Promise<any[]> {
  const db = await getDB()
  return await db.getAllAsync('SELECT * FROM clients ORDER BY created_at DESC') as any[]
}

export async function getClient(id: string): Promise<any | null> {
  const db = await getDB()
  return await db.getFirstAsync('SELECT * FROM clients WHERE id = ?', [id])
}

export async function createClient(c: Partial<Client>): Promise<string> {
  const db = await getDB()
  const id = genId()
  await db.runAsync(
    'INSERT INTO clients (id,name,phone,email,type,notes,budget_min,budget_max) VALUES (?,?,?,?,?,?,?,?)',
    [id, c.name || '', c.phone || '', c.email || '', c.type || 'buyer', c.notes || '', c.budget_min || 0, c.budget_max || 0]
  )
  await logChange({ action: 'create', scope: 'clients', scopeId: id, after: c, summary: `إنشاء عميل "${c.name || ''}"` })
  return id
}

export async function updateClient(id: string, c: Partial<Client>): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM clients WHERE id = ?', [id])
  if (!before) throw new Error(`العميل (${id}) غير موجود.`)
  const allowed = new Set(['name', 'phone', 'email', 'type', 'notes', 'budget_min', 'budget_max'])
  const entries = Object.entries(c).filter(([key]) => allowed.has(key))
  if (!entries.length) return
  await db.runAsync(`UPDATE clients SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`, [...entries.map(([, value]) => value), id])
  await logChange({ action: 'update', scope: 'clients', scopeId: id, before, after: Object.fromEntries(entries), summary: `تعديل عميل (${id})` })
}

export async function deleteClient(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM clients WHERE id = ?', [id])
  if (!before) throw new Error(`العميل (${id}) غير موجود.`)
  await db.runAsync('DELETE FROM clients WHERE id = ?', [id])
  await logChange({ action: 'delete', scope: 'clients', scopeId: id, before, summary: `حذف عميل (${id})` })
}

// CRUD helpers - OFFER
async function attachOfferReminders<T extends { id: string }>(rows: T[]): Promise<(T & { reminders: OfferReminder[] })[]> {
  if (!rows.length) return rows.map((row) => ({ ...row, reminders: [] }))
  const db = await getDB()
  const ids = rows.map((row) => row.id)
  const placeholders = ids.map(() => '?').join(', ')
  const reminderRows = await db.getAllAsync<OfferReminder & { target_id: string }>(
    `SELECT *, target_id as offer_id FROM reminders WHERE target_type = 'offer' AND target_id IN (${placeholders}) AND status IN ('scheduled', 'pending_permission') ORDER BY remind_at ASC`,
    ids,
  )
  const grouped = new Map<string, OfferReminder[]>()
  for (const reminder of reminderRows) {
    const list = grouped.get(reminder.offer_id) ?? []
    list.push(reminder)
    grouped.set(reminder.offer_id, list)
  }
  return rows.map((row) => ({ ...row, reminders: grouped.get(row.id) ?? [] }))
}

export async function getOffer(id: string): Promise<any | null> {
  const db = await getDB()
  const row = await db.getFirstAsync(`
    SELECT o.*, p.name as property_name, c.name as client_name
    FROM offers o
    LEFT JOIN properties p ON o.property_id = p.id
    LEFT JOIN clients c ON o.client_id = c.id
    WHERE o.id = ?
  `, [id]) as any | null
  if (!row) return null
  return (await attachOfferReminders([row]))[0]
}

export async function getAllOffers(): Promise<any[]> {
  const db = await getDB()
  const rows = await db.getAllAsync(`
    SELECT o.*, p.name as property_name, c.name as client_name
    FROM offers o
    LEFT JOIN properties p ON o.property_id = p.id
    LEFT JOIN clients c ON o.client_id = c.id
    ORDER BY o.created_at DESC
  `) as any[]
  return attachOfferReminders(rows)
}

export async function updateOffer(id: string, o: Partial<Offer>): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM offers WHERE id = ?', [id]) as any
  if (!before) throw new Error(`العرض (${id}) غير موجود.`)
  const allowed = new Set(['property_id', 'client_id', 'type', 'amount', 'status', 'date', 'notes', 'media'])
  const entries = Object.entries(o).filter(([key]) => allowed.has(key))
  if (!entries.length) return
  const values: any[] = entries.map(([key, value]) => key === 'property_id' ? (value ? String(value) : null) : value)
  await db.runAsync(`UPDATE offers SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`, [...values, id])
  await logChange({ action: 'update', scope: 'offers', scopeId: id, before, after: Object.fromEntries(entries), summary: `تعديل عرض (${id})` })
}

export async function createOffer(o: Partial<Offer>): Promise<string> {
  const db = await getDB()
  const id = genId()
  await db.runAsync(
    'INSERT INTO offers (id,property_id,client_id,type,amount,status,date,notes,media) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, o.property_id ? String(o.property_id) : null, o.client_id ? String(o.client_id) : null, o.type || 'buy_offer', o.amount || 0, o.status || 'pending', o.date || '', o.notes || '', (o as any).media || '[]']
  )
  await logChange({ action: 'create', scope: 'offers', scopeId: id, after: o, summary: 'إنشاء عرض' })
  return id
}

export async function getRemindersForTarget(targetType: string, targetId: string, includeCancelled = false): Promise<any[]> {
  const db = await getDB()
  const where = includeCancelled ? '' : " AND status IN ('scheduled', 'pending_permission')"
  return await db.getAllAsync(`SELECT * FROM reminders WHERE target_type = ? AND target_id = ?${where} ORDER BY remind_at ASC`, [targetType, targetId]) as any[]
}

export async function getOfferReminders(offerId: string, includeCancelled = false): Promise<OfferReminder[]> {
  const rows = await getRemindersForTarget('offer', offerId, includeCancelled)
  return rows.map((row) => ({ ...row, offer_id: row.target_id })) as OfferReminder[]
}

export async function createEntityReminder(input: {
  targetType?: string
  targetId?: string
  title: string
  body?: string
  remindAt: string
  offerMeta?: { propertyName?: string; clientName?: string; amount?: number }
}): Promise<string> {
  const title = String(input.title || '').trim()
  const body = String(input.body || '').trim()
  const targetType = String(input.targetType || 'general').trim() || 'general'
  const targetId = String(input.targetId || '').trim()
  const date = new Date(String(input.remindAt || ''))
  if (!title) throw new Error('عنوان التذكير مطلوب.')
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) throw new Error('موعد التذكير غير صالح أو منتهٍ.')
  if (targetType !== 'general' && !targetId) throw new Error('التنبيه المرتبط يحتاج target_id.')
  const db = await getDB()
  const id = genId()
  let notificationId = ''
  let status: 'scheduled' | 'pending_permission' = Platform.OS === 'web' ? 'pending_permission' : 'scheduled'
  try {
    if (Platform.OS !== 'web') {
      notificationId = targetType === 'offer'
        ? await scheduleOfferReminder(date, { offerId: targetId, propertyName: input.offerMeta?.propertyName, clientName: input.offerMeta?.clientName, amount: Number(input.offerMeta?.amount) || 0 })
        : await scheduleLocalReminder(date, title, body || title, { type: 'entity-reminder', reminderId: id, targetType, targetId })
    }
  } catch (error) {
    const permissionBlocked = error instanceof Error && error.message.includes('صلاحية الإشعارات المحلية')
    if (!permissionBlocked) throw error
    status = 'pending_permission'
    notificationId = ''
  }
  await db.runAsync(
    'INSERT INTO reminders (id,title,body,remind_at,notification_id,status,target_type,target_id) VALUES (?,?,?,?,?,?,?,?)',
    [id, title, body, date.toISOString(), notificationId, status, targetType, targetId],
  )
  await logChange({ action: 'create', scope: 'reminders', scopeId: id, after: { title, body, remind_at: date.toISOString(), notification_id: notificationId, status, target_type: targetType, target_id: targetId }, summary: `إنشاء تنبيه "${title}"${status === 'pending_permission' ? ' (بانتظار صلاحية الإشعارات)' : ''}` })
  return id
}

export async function createOfferReminder(input: {
  offerId: string
  remindAt: string
  title?: string
  body?: string
  propertyName?: string
  clientName?: string
  amount?: number
}): Promise<string> {
  const offer = await getOffer(input.offerId)
  if (!offer) throw new Error(`العرض (${input.offerId}) غير موجود.`)
  const id = await createEntityReminder({
    targetType: 'offer',
    targetId: input.offerId,
    title: input.title || 'متابعة العرض',
    body: input.body,
    remindAt: input.remindAt,
    offerMeta: { propertyName: input.propertyName ?? offer.property_name, clientName: input.clientName ?? offer.client_name, amount: Number(input.amount ?? offer.amount) || 0 },
  })
  const db = await getDB()
  const active = await getOfferReminders(input.offerId)
  if (active.length === 1) await db.runAsync('UPDATE offers SET reminder_at = ?, reminder_notification_id = ? WHERE id = ?', [active[0].remind_at, active[0].notification_id, input.offerId])
  return id
}

export async function cancelOfferReminderById(reminderId: string): Promise<void> {
  const before = await getReminder(reminderId) as any
  if (!before || before.target_type !== 'offer') throw new Error(`تنبيه العرض (${reminderId}) غير موجود.`)
  await cancelReminder(reminderId)
}

export async function cancelOfferReminders(offerId: string): Promise<void> {
  const reminders = await getOfferReminders(offerId)
  for (const reminder of reminders) await cancelOfferReminderById(reminder.id)
  const db = await getDB()
  await db.runAsync('UPDATE offers SET reminder_at = ?, reminder_notification_id = ? WHERE id = ?', ['', '', offerId])
}

/** توافق رجعي مع واجهة التنبيه القديمة؛ يخزن في reminders canonical ولا يلغي التنبيهات الأخرى عند الضبط. */
export async function setOfferReminder(id: string, reminderAt: string | null, notificationId: string | null): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT reminder_at, reminder_notification_id FROM offers WHERE id = ?', [id])
  if (!before) throw new Error(`العرض (${id}) غير موجود.`)
  if (!reminderAt || !notificationId) {
    await cancelOfferReminders(id)
    await logChange({ action: 'update', scope: 'offers', scopeId: id, before, after: { reminder_at: '', reminder_notification_id: '' }, summary: `إلغاء تنبيهات العرض (${id})` })
    return
  }
  const existing = (await getOfferReminders(id))[0]
  if (existing) {
    await db.runAsync('UPDATE reminders SET remind_at = ?, notification_id = ?, status = ?, target_type = ?, target_id = ? WHERE id = ?', [reminderAt, notificationId, 'scheduled', 'offer', id, existing.id])
  } else {
    await db.runAsync('INSERT OR IGNORE INTO reminders (id,title,body,remind_at,notification_id,status,target_type,target_id) VALUES (?,?,?,?,?,?,?,?)', [`legacy-${id}`, 'متابعة العرض', '', reminderAt, notificationId, 'scheduled', 'offer', id])
  }
  await db.runAsync('UPDATE offers SET reminder_at = ?, reminder_notification_id = ? WHERE id = ?', [reminderAt, notificationId, id])
  await logChange({ action: 'update', scope: 'offers', scopeId: id, before, after: { reminder_at: reminderAt, reminder_notification_id: notificationId }, summary: `ضبط تنبيه للعرض (${id})` })
}

export async function deleteOffer(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM offers WHERE id = ?', [id])
  if (!before) throw new Error(`العرض (${id}) غير موجود.`)
  const linkedReminders = await getOfferReminders(id, true)
  for (const reminder of linkedReminders) await cancelLocalReminder(reminder.notification_id).catch(() => {})
  if ((before as any)?.reminder_notification_id && !linkedReminders.some((reminder) => reminder.notification_id === (before as any).reminder_notification_id)) {
    await cancelOfferReminder((before as any).reminder_notification_id).catch(() => {})
  }
  await db.runAsync('DELETE FROM offers WHERE id = ?', [id])
  await logChange({ action: 'delete', scope: 'offers', scopeId: id, before, summary: `حذف عرض (${id})` })
}

// CRUD helpers - REMINDERS
export async function getAllReminders(includeCancelled = false): Promise<any[]> {
  const db = await getDB()
  const where = includeCancelled ? '' : "WHERE status IN ('scheduled', 'pending_permission')"
  return await db.getAllAsync(`SELECT * FROM reminders ${where} ORDER BY remind_at ASC`) as any[]
}

export async function getReminder(id: string): Promise<any | null> {
  const db = await getDB()
  return await db.getFirstAsync('SELECT * FROM reminders WHERE id = ?', [id])
}

export async function createReminder(r: { title: string; body?: string; remind_at: string; target_type?: string; target_id?: string }): Promise<string> {
  return createEntityReminder({ title: r.title, body: r.body, remindAt: r.remind_at, targetType: r.target_type || 'general', targetId: r.target_id || '' })
}

export async function clearAllReminders(): Promise<void> {
  const db = await getDB()
  const reminders = await getAllReminders(true)
  for (const reminder of reminders) await cancelLocalReminder(reminder.notification_id).catch(() => {})
  await db.runAsync('DELETE FROM reminders')
}

export async function cancelReminder(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM reminders WHERE id = ?', [id]) as any
  if (!before) throw new Error(`التذكير (${id}) غير موجود.`)
  if (before.status === 'cancelled') return
  await cancelLocalReminder(before.notification_id)
  await db.runAsync("UPDATE reminders SET status = 'cancelled', notification_id = '' WHERE id = ?", [id])
  if (before.target_type === 'offer' && before.target_id) {
    const active = await getOfferReminders(String(before.target_id))
    const next = active[0]
    await db.runAsync('UPDATE offers SET reminder_at = ?, reminder_notification_id = ? WHERE id = ?', [next?.remind_at || '', next?.notification_id || '', before.target_id])
  }
  await logChange({ action: 'update', scope: 'reminders', scopeId: id, before, after: { status: 'cancelled' }, summary: `إلغاء تذكير (${id})` })
}

// CRUD helpers - CAMPAIGN
export async function getAllCampaigns(): Promise<any[]> {
  const db = await getDB()
  return await db.getAllAsync('SELECT * FROM campaigns ORDER BY created_at DESC') as any[]
}

export async function createCampaign(c: Partial<Campaign>): Promise<string> {
  const db = await getDB()
  const id = genId()
  await db.runAsync(
    'INSERT INTO campaigns (id,name,description,type,status,budget,start_date,end_date,notes) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, c.name || '', c.description || '', c.type || 'social_media', c.status || 'draft', c.budget || 0, c.start_date || '', c.end_date || '', c.notes || '']
  )
  await logChange({ action: 'create', scope: 'campaigns', scopeId: id, after: c, summary: `إنشاء حملة "${c.name || ''}"` })
  return id
}

export async function deleteCampaign(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM campaigns WHERE id = ?', [id])
  if (!before) throw new Error(`الحملة (${id}) غير موجودة.`)
  await db.runAsync('DELETE FROM campaigns WHERE id = ?', [id])
  await logChange({ action: 'delete', scope: 'campaigns', scopeId: id, before, summary: `حذف حملة (${id})` })
}

// CRUD helpers - VIEWING
export async function getAllViewings(): Promise<any[]> {
  const db = await getDB()
  return await db.getAllAsync(`
    SELECT v.*, p.name as property_name, c.name as client_name
    FROM viewings v
    LEFT JOIN properties p ON v.property_id = p.id
    LEFT JOIN clients c ON v.client_id = c.id
    ORDER BY v.date_time DESC
  `) as any[]
}

export async function createViewing(v: Partial<Viewing>): Promise<string> {
  const db = await getDB()
  const id = genId()
  await db.runAsync(
    'INSERT INTO viewings (id,property_id,client_id,date_time,status,notes) VALUES (?,?,?,?,?,?)',
    [id, v.property_id || '', v.client_id || '', v.date_time || new Date().toISOString(), v.status || 'scheduled', v.notes || '']
  )
  await logChange({ action: 'create', scope: 'viewings', scopeId: id, after: v, summary: 'إنشاء معاينة' })
  return id
}

export async function deleteViewing(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM viewings WHERE id = ?', [id])
  if (!before) throw new Error(`المعاينة (${id}) غير موجودة.`)
  await db.runAsync('DELETE FROM viewings WHERE id = ?', [id])
  await logChange({ action: 'delete', scope: 'viewings', scopeId: id, before, summary: `حذف معاينة (${id})` })
}

// STATS
export async function getStats(): Promise<{
  properties: number
  clients: number
  offers: number
  totalValue: number
}> {
  const db = await getDB()
  const [pCount, cCount, oCount, oSum] = await Promise.all([
    db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM properties'),
    db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM clients'),
    db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM offers'),
    db.getFirstAsync<{ s: number }>('SELECT COALESCE(SUM(amount), 0) as s FROM offers'),
  ])
  return {
    properties: pCount?.c || 0,
    clients: cCount?.c || 0,
    offers: oCount?.c || 0,
    totalValue: oSum?.s || 0,
  }
}

export async function getPropertyTypeDistribution(): Promise<{ type: string; count: number }[]> {
  const db = await getDB()
  const rows = await db.getAllAsync('SELECT type, COUNT(*) as count FROM properties GROUP BY type')
  return rows as any[]
}

export async function getPropertyStatusDistribution(): Promise<{ status: string; count: number }[]> {
  const db = await getDB()
  const rows = await db.getAllAsync('SELECT status, COUNT(*) as count FROM properties GROUP BY status')
  return rows as any[]
}

export async function getOfferStatusDistribution(): Promise<{ status: string; count: number }[]> {
  const db = await getDB()
  const rows = await db.getAllAsync('SELECT status, COUNT(*) as count FROM offers GROUP BY status')
  return rows as any[]
}

export async function getAllWaypoints(): Promise<any[]> {
  const db = await getDB()
  return await db.getAllAsync('SELECT * FROM waypoints ORDER BY created_at DESC') as any[]
}

export async function getWaypoint(id: string): Promise<any | null> {
  const db = await getDB()
  return await db.getFirstAsync('SELECT * FROM waypoints WHERE id = ?', [id]) as any | null
}

export async function createWaypoint(data: {
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  type?: string;
  media?: string;
  category?: string;
  rating?: number;
  owner_name?: string;
  owner_phone?: string;
  owner_contact?: string;
  property_details?: string;
  area_sqm?: number;
  price?: number;
  listing_date?: string;
  media_kind?: string;
  media_count?: number;
}): Promise<string> {
  const db = await getDB()
  const id = genId()
  await db.runAsync(
    `INSERT INTO waypoints (id,name,description,latitude,longitude,type,media,category,tags,rating,owner_name,owner_phone,owner_contact,property_details,area_sqm,price,listing_date,media_kind,media_count)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, data.name, data.description, data.latitude, data.longitude,
      data.type || "custom", data.media || "[]",
      data.category || "general", "[]", data.rating || 0,
      data.owner_name || "", data.owner_phone || "", data.owner_contact || "",
      data.property_details || "", data.area_sqm || 0, data.price || 0,
      data.listing_date || "", data.media_kind || "photo", data.media_count || 0,
    ]
  )
  await logChange({ action: 'create', scope: 'waypoints', scopeId: id, after: data, summary: `إنشاء نقطة "${data.name}"` })
  return id
}

export async function updateWaypoint(id: string, data: Partial<{ name: string; description: string; latitude: number; longitude: number; type: string; media: string }>): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM waypoints WHERE id = ?', [id])
  if (!before) throw new Error(`النقطة (${id}) غير موجودة.`)
  const allowed = new Set(['name', 'description', 'latitude', 'longitude', 'type', 'media'])
  const entries = Object.entries(data).filter(([key]) => allowed.has(key))
  if (!entries.length) return
  await db.runAsync(`UPDATE waypoints SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`, [...entries.map(([, value]) => value), id])
  await logChange({ action: 'update', scope: 'waypoints', scopeId: id, before, after: Object.fromEntries(entries), summary: `تعديل نقطة (${id})` })
}

export async function deleteWaypoint(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM waypoints WHERE id = ?', [id])
  if (!before) throw new Error(`النقطة (${id}) غير موجودة.`)
  await db.runAsync('DELETE FROM waypoints WHERE id = ?', [id])
  await logChange({ action: 'delete', scope: 'waypoints', scopeId: id, before, summary: `حذف نقطة (${id})` })
}

export async function getAllAreas(): Promise<any[]> {
  const db = await getDB()
  return await db.getAllAsync('SELECT * FROM areas ORDER BY created_at DESC') as any[]
}

export async function getArea(id: string): Promise<any | null> {
  const db = await getDB()
  return await db.getFirstAsync('SELECT * FROM areas WHERE id = ?', [id]) as any | null
}

export async function createArea(data: { name: string; description: string; geojson: string; area_sqm: number; perimeter_m: number; media?: string; category?: string; tags?: string; rating?: number }): Promise<string> {
  const db = await getDB()
  const id = genId()
  await db.runAsync(
    'INSERT INTO areas (id,name,description,geojson,area_sqm,perimeter_m,media,category,tags,rating) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [id, data.name, data.description, data.geojson, data.area_sqm, data.perimeter_m, data.media || '[]', data.category || 'general', data.tags || '[]', data.rating || 0]
  )
  await logChange({ action: 'create', scope: 'areas', scopeId: id, after: data, summary: `إنشاء مساحة "${data.name}"` })
  return id
}

export async function updateArea(id: string, data: Partial<{ name: string; description: string; geojson: string; area_sqm: number; perimeter_m: number; media: string }>): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM areas WHERE id = ?', [id])
  if (!before) throw new Error(`المساحة (${id}) غير موجودة.`)
  const allowed = new Set(['name', 'description', 'geojson', 'area_sqm', 'perimeter_m', 'media'])
  const entries = Object.entries(data).filter(([key]) => allowed.has(key))
  if (!entries.length) return
  await db.runAsync(`UPDATE areas SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`, [...entries.map(([, value]) => value), id])
  await logChange({ action: 'update', scope: 'areas', scopeId: id, before, after: Object.fromEntries(entries), summary: `تعديل مساحة (${id})` })
}

export async function deleteArea(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM areas WHERE id = ?', [id])
  if (!before) throw new Error(`المساحة (${id}) غير موجودة.`)
  await db.runAsync('DELETE FROM areas WHERE id = ?', [id])
  await logChange({ action: 'delete', scope: 'areas', scopeId: id, before, summary: `حذف مساحة (${id})` })
}
