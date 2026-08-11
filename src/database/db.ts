import * as SQLite from 'expo-sqlite'
import type { Property, Client, Offer, Campaign, Viewing } from '../types'
import { logChange } from './audit'

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
      property_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      type TEXT DEFAULT 'buy_offer',
      amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
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

    CREATE INDEX IF NOT EXISTS idx_offers_property ON offers (property_id);
    CREATE INDEX IF NOT EXISTS idx_offers_client ON offers (client_id);
    CREATE INDEX IF NOT EXISTS idx_viewings_property ON viewings (property_id);
    CREATE INDEX IF NOT EXISTS idx_viewings_client ON viewings (client_id);
    CREATE INDEX IF NOT EXISTS idx_properties_status ON properties (status);
    CREATE INDEX IF NOT EXISTS idx_properties_type ON properties (type);
    CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties (owner_name);
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

  const count = await database.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM properties')
  if (count && count.c === 0) {
    await seedData(database)
  }
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

async function seedData(database: SQLite.SQLiteDatabase) {
  const now = new Date().toISOString()

  const properties: Omit<Property, 'created_at'>[] = [
    { id: genId(), name: 'فيلا النرجس الفاخرة', description: 'فيلا حديثة بحديقة خاصة وحمام سباحة', price: 1250000, area: 350, latitude: 24.7136, longitude: 46.6753, address: 'حي النرجس، الرياض', status: 'for_sale', type: 'villa', owner_name: 'أحمد محمد', owner_phone: '0551234567', owner_email: 'ahmed@email.com' },
    { id: genId(), name: 'شقة الملقا العصرية', description: 'شقة بتصميم عصري على دور 12', price: 850000, area: 180, latitude: 24.8253, longitude: 46.6285, address: 'حي الملقا، الرياض', status: 'pending', type: 'apartment', owner_name: 'سعد العلي', owner_phone: '0559876543', owner_email: 'saad@email.com' },
    { id: genId(), name: 'أرض الياسمين الاستثمارية', description: 'أرض سكنية قابلة للبناء', price: 2100000, area: 500, latitude: 24.7711, longitude: 46.7381, address: 'حي الياسمين، الرياض', status: 'for_sale', type: 'land', owner_name: 'فهد السالم', owner_phone: '0534567890', owner_email: 'fahad@email.com' },
    { id: genId(), name: 'مكتب العليا المتميز', description: 'مكتب تجاري بمساحة كبيرة', price: 980000, area: 220, latitude: 24.6920, longitude: 46.6850, address: 'حي العليا، الرياض', status: 'rented', type: 'office', owner_name: 'خالد عبدالله', owner_phone: '0512345678', owner_email: 'khalid@email.com' },
    { id: genId(), name: 'محل تجاري في الواحة', description: 'محل تجاري في مول حيوي', price: 1500000, area: 120, latitude: 24.7555, longitude: 46.6500, address: 'حي الواحة، الرياض', status: 'sold', type: 'commercial', owner_name: 'ناصر الحربي', owner_phone: '0567890123', owner_email: 'nasser@email.com' },
  ]

  for (const p of properties) {
    await database.runAsync(
      'INSERT INTO properties (id,name,description,price,area,latitude,longitude,address,status,type,owner_name,owner_phone,owner_email,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [p.id, p.name, p.description, p.price, p.area, p.latitude, p.longitude, p.address, p.status, p.type, p.owner_name, p.owner_phone, p.owner_email, now]
    )
  }

  const clients: Omit<Client, 'created_at'>[] = [
    { id: genId(), name: 'محمد أحمد', phone: '0551112233', email: 'mohamed@email.com', type: 'buyer', notes: 'يبحث عن فيلا بحديقة', budget_min: 800000, budget_max: 1500000 },
    { id: genId(), name: 'سارة خالد', phone: '0552223344', email: 'sara@email.com', type: 'buyer', notes: 'مهتمة بالشقق الحديثة', budget_min: 500000, budget_max: 1000000 },
    { id: genId(), name: 'عبدالله سالم', phone: '0553334455', email: 'abdullah@email.com', type: 'seller', notes: 'يرغب ببيع أرضه', budget_min: 0, budget_max: 0 },
    { id: genId(), name: 'نورة العتيبي', phone: '0554445566', email: 'noura@email.com', type: 'both', notes: 'تبيع و تشتري', budget_min: 300000, budget_max: 2000000 },
  ]

  for (const c of clients) {
    await database.runAsync(
      'INSERT INTO clients (id,name,phone,email,type,notes,budget_min,budget_max,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [c.id, c.name, c.phone, c.email, c.type, c.notes, c.budget_min, c.budget_max, now]
    )
  }

  const propertyIds = properties.map(p => p.id)
  const clientIds = clients.map(c => c.id)

  const offers: Omit<Offer, 'created_at'>[] = [
    { id: genId(), property_id: propertyIds[0], client_id: clientIds[0], type: 'buy_offer', amount: 1200000, status: 'pending', date: '2024-01-15', notes: 'العمير يريد غرفة إضافية' },
    { id: genId(), property_id: propertyIds[1], client_id: clientIds[1], type: 'buy_offer', amount: 820000, status: 'accepted', date: '2024-01-14', notes: 'مقبول مبدئياً' },
    { id: genId(), property_id: propertyIds[2], client_id: clientIds[2], type: 'sell_offer', amount: 2000000, status: 'rejected', date: '2024-01-13', notes: 'السعر منخفض عن المطلوب' },
    { id: genId(), property_id: propertyIds[3], client_id: clientIds[3], type: 'buy_offer', amount: 950000, status: 'countered', date: '2024-01-12', notes: 'تم تقديم عرض مضاد' },
  ]

  for (const o of offers) {
    await database.runAsync(
      'INSERT INTO offers (id,property_id,client_id,type,amount,status,date,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [o.id, o.property_id, o.client_id, o.type, o.amount, o.status, o.date, o.notes, now]
    )
  }

  const campaigns: Omit<Campaign, 'created_at'>[] = [
    { id: genId(), name: 'حملة إنستغرام العقارية', description: 'حملة تسويقية على إنستغرام', type: 'social_media', status: 'active', budget: 5000, start_date: '2024-01-01', end_date: '2024-02-01', notes: 'إعلانات مصورة للملكيات' },
    { id: genId(), name: 'رسائل بريد عملاء', description: 'رسائل إلكترونية للعملاء المسجلين', type: 'email', status: 'draft', budget: 500, start_date: '2024-02-01', end_date: '2024-03-01', notes: 'إعلان خصومات' },
  ]

  for (const c of campaigns) {
    await database.runAsync(
      'INSERT INTO campaigns (id,name,description,type,status,budget,start_date,end_date,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [c.id, c.name, c.description, c.type, c.status, c.budget, c.start_date, c.end_date, c.notes, now]
    )
  }

  const viewings: Omit<Viewing, 'created_at'>[] = [
    { id: genId(), property_id: propertyIds[0], client_id: clientIds[0], date_time: '2024-01-20T10:00:00', status: 'scheduled', notes: 'موعد مشاهدة فيلا النرجس' },
    { id: genId(), property_id: propertyIds[1], client_id: clientIds[1], date_time: '2024-01-21T14:00:00', status: 'completed', notes: 'تمت مشاهدة شقة الملقا' },
    { id: genId(), property_id: propertyIds[2], client_id: clientIds[2], date_time: '2024-01-22T11:00:00', status: 'cancelled', notes: 'ألغاه العميل' },
  ]

  for (const v of viewings) {
    await database.runAsync(
      'INSERT INTO viewings (id,property_id,client_id,date_time,status,notes,created_at) VALUES (?,?,?,?,?,?,?)',
      [v.id, v.property_id, v.client_id, v.date_time, v.status, v.notes, now]
    )
  }
}

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
  await db.runAsync(
    'INSERT INTO properties (id,name,description,price,area,latitude,longitude,address,status,type,owner_name,owner_phone,owner_email,geojson,category,area_sqm) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, p.name || '', p.description || '', p.price || 0, p.area || 0, p.latitude || 0, p.longitude || 0, p.address || '', p.status || 'for_sale', p.type || 'apartment', p.owner_name || '', p.owner_phone || '', p.owner_email || '', (p as any).geojson || '', (p as any).category || 'general', (p as any).area_sqm || 0]
  )
  await logChange({ action: 'create', scope: 'properties', scopeId: id, after: p, summary: `إنشاء عقار "${p.name || ''}"` })
  return id
}

export async function updateProperty(id: string, p: Partial<Property>): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM properties WHERE id = ?', [id])
  await db.runAsync(
    'UPDATE properties SET name=?,description=?,price=?,area=?,latitude=?,longitude=?,address=?,status=?,type=?,owner_name=?,owner_phone=?,owner_email=?,geojson=?,category=?,area_sqm=? WHERE id=?',
    [p.name || '', p.description || '', p.price || 0, p.area || 0, p.latitude || 0, p.longitude || 0, p.address || '', p.status || 'for_sale', p.type || 'apartment', p.owner_name || '', p.owner_phone || '', p.owner_email || '', (p as any).geojson || '', (p as any).category || 'general', (p as any).area_sqm || 0, id]
  )
  await logChange({ action: 'update', scope: 'properties', scopeId: id, before, after: p, summary: `تعديل عقار (${id})` })
}

export async function deleteProperty(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM properties WHERE id = ?', [id])
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
  await db.runAsync(
    'UPDATE clients SET name=?,phone=?,email=?,type=?,notes=?,budget_min=?,budget_max=? WHERE id=?',
    [c.name || '', c.phone || '', c.email || '', c.type || 'buyer', c.notes || '', c.budget_min || 0, c.budget_max || 0, id]
  )
  await logChange({ action: 'update', scope: 'clients', scopeId: id, before, after: c, summary: `تعديل عميل (${id})` })
}

export async function deleteClient(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM clients WHERE id = ?', [id])
  await db.runAsync('DELETE FROM clients WHERE id = ?', [id])
  await logChange({ action: 'delete', scope: 'clients', scopeId: id, before, summary: `حذف عميل (${id})` })
}

// CRUD helpers - OFFER
export async function getAllOffers(): Promise<any[]> {
  const db = await getDB()
  return await db.getAllAsync(`
    SELECT o.*, p.name as property_name, c.name as client_name
    FROM offers o
    LEFT JOIN properties p ON o.property_id = p.id
    LEFT JOIN clients c ON o.client_id = c.id
    ORDER BY o.created_at DESC
  `) as any[]
}

export async function createOffer(o: Partial<Offer>): Promise<string> {
  const db = await getDB()
  const id = genId()
  await db.runAsync(
    'INSERT INTO offers (id,property_id,client_id,type,amount,status,date,notes) VALUES (?,?,?,?,?,?,?,?)',
    [id, o.property_id || '', o.client_id || '', o.type || 'buy_offer', o.amount || 0, o.status || 'pending', o.date || '', o.notes || '']
  )
  await logChange({ action: 'create', scope: 'offers', scopeId: id, after: o, summary: 'إنشاء عرض' })
  return id
}

export async function deleteOffer(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM offers WHERE id = ?', [id])
  await db.runAsync('DELETE FROM offers WHERE id = ?', [id])
  await logChange({ action: 'delete', scope: 'offers', scopeId: id, before, summary: `حذف عرض (${id})` })
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
  await db.runAsync(
    'UPDATE waypoints SET name=?,description=?,latitude=?,longitude=?,type=?,media=? WHERE id=?',
    [data.name || '', data.description || '', data.latitude || 0, data.longitude || 0, data.type || 'custom', data.media || '[]', id]
  )
  await logChange({ action: 'update', scope: 'waypoints', scopeId: id, before, after: data, summary: `تعديل نقطة (${id})` })
}

export async function deleteWaypoint(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM waypoints WHERE id = ?', [id])
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
  await db.runAsync(
    'UPDATE areas SET name=?,description=?,geojson=?,area_sqm=?,perimeter_m=?,media=? WHERE id=?',
    [data.name || '', data.description || '', data.geojson || '{}', data.area_sqm || 0, data.perimeter_m || 0, data.media || '[]', id]
  )
  await logChange({ action: 'update', scope: 'areas', scopeId: id, before, after: data, summary: `تعديل مساحة (${id})` })
}

export async function deleteArea(id: string): Promise<void> {
  const db = await getDB()
  const before = await db.getFirstAsync('SELECT * FROM areas WHERE id = ?', [id])
  await db.runAsync('DELETE FROM areas WHERE id = ?', [id])
  await logChange({ action: 'delete', scope: 'areas', scopeId: id, before, summary: `حذف مساحة (${id})` })
}
