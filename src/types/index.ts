export type PropertyType = 'apartment' | 'villa' | 'house' | 'hotel' | 'building' | 'residential_tower' | 'farm' | 'land' | 'warehouse' | 'shop' | 'office' | 'commercial'

export interface Property {
  id: string
  name: string
  description: string
  price: number
  area: number
  latitude: number
  longitude: number
  address: string
  status: 'for_sale' | 'sold' | 'rented' | 'pending'
  type: PropertyType
  icon_uri: string
  owner_name: string
  owner_phone: string
  owner_email: string
  broker_name: string
  broker_phone: string
  created_at: string
}

export interface Client {
  id: string
  name: string
  phone: string
  email: string
  type: 'buyer' | 'seller' | 'both'
  notes: string
  budget_min: number
  budget_max: number
  created_at: string
}

export interface Offer {
  id: string
  property_id: string
  client_id: string
  type: 'buy_offer' | 'sell_offer'
  amount: number
  status: 'pending' | 'accepted' | 'rejected' | 'countered'
  date: string
  notes: string
  reminder_at: string
  reminder_notification_id: string
  created_at: string
}

export interface Reminder {
  id: string
  title: string
  body: string
  remind_at: string
  notification_id: string
  status: 'scheduled' | 'cancelled'
  created_at: string
}

export interface Campaign {
  id: string
  name: string
  description: string
  type: 'social_media' | 'email' | 'sms' | 'brochure'
  status: 'draft' | 'active' | 'completed'
  budget: number
  start_date: string
  end_date: string
  notes: string
  created_at: string
}

export interface Viewing {
  id: string
  property_id: string
  client_id: string
  date_time: string
  status: 'scheduled' | 'completed' | 'cancelled'
  notes: string
  created_at: string
}

export interface Waypoint {
  id: string
  name: string
  description: string
  latitude: number
  longitude: number
  type: string
  media: string
  created_at: string
}

export interface Area {
  id: string
  name: string
  description: string
  geojson: string
  area_sqm: number
  perimeter_m: number
  media: string
  created_at: string
}

export const STATUS_LABELS: Record<string, string> = {
  for_sale: 'للبيع',
  sold: 'مباع',
  rented: 'مؤجر',
  pending: 'قيد الانتظار',
  buyer: 'مشتري',
  seller: 'بائع',
  both: 'الاثنين',
  buy_offer: 'عرض شراء',
  sell_offer: 'عرض بيع',
  pending_offer: 'قيد المراجعة',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  countered: 'عرض مضاد',
  scheduled: 'مجدول',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  draft: 'مسودة',
  active: 'نشط',
  completed_campaign: 'منتهي',
  social_media: 'وسائل التواصل',
  email: 'بريد إلكتروني',
  sms: 'رسائل نصية',
  brochure: 'بروشور',
}

export const TYPE_LABELS: Record<string, string> = {
  apartment: 'شقة',
  villa: 'فيلا',
  house: 'بيت',
  hotel: 'فندق',
  building: 'عمارة',
  residential_tower: 'برج سكني',
  farm: 'مزرعة',
  land: 'قطعة أرض',
  warehouse: 'هناجر',
  shop: 'محلات',
  office: 'مكتب',
  commercial: 'تجاري',
}
