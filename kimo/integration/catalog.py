"""Entity catalog — faithful Python port of ``src/agent/catalog.ts``.

Defines every entity the agent can touch, its table, title field, and the
Arabic field labels/types used for search, filtering and validation. Keeping
this data-driven (not hand-coded SQL per entity) is what lets the store and
tools stay small while supporting all entities uniformly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


class FieldType:
    TEXT = "text"
    NUMBER = "number"
    DATE = "date"
    DATETIME = "datetime"
    SELECT = "select"


@dataclass
class FieldDef:
    name: str
    label: str
    type: str
    searchable: bool = False
    filterable: bool = False
    sortable: bool = False
    values: Optional[dict[str, str]] = None
    fk: Optional[dict[str, str]] = None


@dataclass
class NamesJoin:
    select: str
    join: str
    search: Optional[dict[str, Any]] = None


@dataclass
class EntityDef:
    key: str
    table: str
    label: str
    title_field: str
    fields: list[FieldDef] = field(default_factory=list)
    custom_field_entities: bool = False
    parent: Optional[str] = None
    relations: list[str] = field(default_factory=list)
    names_join: Optional[NamesJoin] = None


STATUS_PROPERTY_LABELS = {
    "for_sale": "للبيع", "pending": "قيد الإجراء", "rented": "مؤجّر", "sold": "مبيعة",
}
PROPERTY_TYPE_LABELS = {
    "apartment": "شقة", "villa": "فيلا", "house": "بيت", "hotel": "فندق",
    "building": "عمارة", "residential_tower": "برج سكني", "farm": "مزرعة",
    "land": "قطعة أرض", "warehouse": "هناجر", "shop": "محلات", "office": "مكتب",
    "commercial": "محل تجاري",
}
CLIENT_TYPE_LABELS = {"buyer": "مشتري", "seller": "بائع", "both": "الاثنان"}
OFFER_TYPE_LABELS = {"buy_offer": "عرض شراء", "sell_offer": "عرض بيع"}
OFFER_STATUS_LABELS = {"pending": "قيد الانتظار", "accepted": "مقبول", "rejected": "مرفوض", "countered": "بعرض مضاد"}
CAMPAIGN_TYPE_LABELS = {"social_media": "تواصل اجتماعي", "email": "بريد", "sms": "رسائل", "brochure": "مطوية"}
CAMPAIGN_STATUS_LABELS = {"draft": "مسودة", "active": "نشطة", "completed": "مكتملة"}
VIEWING_STATUS_LABELS = {"scheduled": "مجدولة", "completed": "تمت", "cancelled": "ملغاة"}
ENTITY_TYPE_LABELS = {"project": "مشروع", "block": "بلوك", "plot": "قطعة"}
PLOT_STATUS_LABELS = {"available": "متاحة", "reserved": "محجوزة", "sold": "مبيعة", "installed": "قيد التقسيط"}
INSTALLMENT_TYPE_LABELS = {
    "monthly": "شهري", "quarterly": "ربع سنوي", "semi_annual": "نصف سنوي",
    "annual": "سنوي", "cash": "كاش",
}
PAYMENT_METHOD_LABELS = {"cash": "كاش", "bank": "بنك"}
FIELD_VALUE_TYPE_LABELS = {"text": "نص", "number": "رقم", "date": "تاريخ", "boolean": "نعم/لا", "select": "اختيار"}

ENTITY_LABELS = {
    "properties": "العقارات", "clients": "العملاء", "offers": "العروض",
    "campaigns": "الحملات", "viewings": "المعاينات", "waypoints": "النقاط على الخريطة",
    "areas": "المساحات", "projects": "المشاريع", "blocks": "البلوكات",
    "plots": "القطع", "plot_payments": "أقساط القطع",
    "custom_fields": "الحقول المخصصة", "custom_field_values": "قيم الحقول المخصصة",
}


def f(name, label, type, **extra):
    return FieldDef(name=name, label=label, type=type, **extra)


ALL_ENTITIES: list[EntityDef] = [
    EntityDef(
        key="properties", table="properties", label=ENTITY_LABELS["properties"], title_field="name",
        fields=[
            f("id", "المعرف", "text"), f("name", "الاسم", "text", searchable=True, filterable=True, sortable=True),
            f("description", "الوصف", "text", searchable=True, filterable=True),
            f("price", "السعر (ر.ي)", "number", filterable=True, sortable=True),
            f("area", "المساحة", "number", filterable=True, sortable=True),
            f("area_sqm", "المساحة بالمتر", "number", filterable=True, sortable=True),
            f("latitude", "خط العرض", "number", filterable=True), f("longitude", "خط الطول", "number", filterable=True),
            f("address", "العنوان", "text", searchable=True, filterable=True),
            f("status", "الحالة", "select", filterable=True, sortable=True, values=STATUS_PROPERTY_LABELS),
            f("type", "النوع", "select", filterable=True, values=PROPERTY_TYPE_LABELS),
            f("owner_name", "اسم المالك", "text", searchable=True, filterable=True),
            f("owner_phone", "جوال المالك", "text", searchable=True, filterable=True),
            f("owner_email", "بريد المالك", "text", searchable=True, filterable=True),
            f("broker_name", "اسم الدلال", "text", searchable=True, filterable=True),
            f("broker_phone", "رقم الدلال", "text", searchable=True, filterable=True),
            f("icon_uri", "صورة الأيقونة", "text"), f("geojson", "الجيومتريا", "text"),
            f("category", "التصنيف", "select", filterable=True),
            f("created_at", "تاريخ الإنشاء", "datetime", sortable=True),
        ],
    ),
    EntityDef(
        key="clients", table="clients", label=ENTITY_LABELS["clients"], title_field="name",
        fields=[
            f("id", "المعرف", "text"), f("name", "الاسم", "text", searchable=True, filterable=True, sortable=True),
            f("phone", "الجوال", "text", searchable=True, filterable=True),
            f("email", "البريد", "text", searchable=True, filterable=True),
            f("type", "النوع", "select", filterable=True, values=CLIENT_TYPE_LABELS),
            f("notes", "ملاحظات", "text", searchable=True, filterable=True),
            f("budget_min", "ميزانية من", "number", filterable=True, sortable=True),
            f("budget_max", "ميزانية إلى", "number", filterable=True, sortable=True),
            f("created_at", "تاريخ الإنشاء", "datetime", sortable=True),
        ],
    ),
    EntityDef(
        key="offers", table="offers", label=ENTITY_LABELS["offers"], title_field="notes", parent="properties",
        relations=["reminders: target_type=offer, target_id=id"],
        fields=[
            f("id", "المعرف", "text"),
            f("property_id", "العقار", "text", filterable=True, fk={"to": "properties", "via": "property_id"}),
            f("client_id", "العميل", "text", filterable=True, fk={"to": "clients", "via": "client_id"}),
            f("type", "النوع", "select", filterable=True, values=OFFER_TYPE_LABELS),
            f("amount", "المبلغ (ر.ي)", "number", filterable=True, sortable=True),
            f("status", "الحالة", "select", filterable=True, values=OFFER_STATUS_LABELS),
            f("date", "التاريخ", "date", filterable=True, sortable=True),
            f("notes", "ملاحظات", "text", searchable=True, filterable=True),
            f("reminder_at", "موعد تنبيه المتابعة", "datetime", filterable=True, sortable=True),
            f("created_at", "تاريخ الإنشاء", "datetime", sortable=True),
        ],
        names_join=NamesJoin(
            select=", p.name as property_name, c.name as client_name",
            join=" LEFT JOIN properties p ON e.property_id = p.id LEFT JOIN clients c ON e.client_id = c.id",
            search={"sql": "(p.name LIKE ? OR c.name LIKE ?)", "paramCount": 2},
        ),
    ),
    EntityDef(
        key="campaigns", table="campaigns", label=ENTITY_LABELS["campaigns"], title_field="name",
        fields=[
            f("id", "المعرف", "text"), f("name", "الاسم", "text", searchable=True, filterable=True, sortable=True),
            f("description", "الوصف", "text", searchable=True, filterable=True),
            f("type", "النوع", "select", filterable=True, values=CAMPAIGN_TYPE_LABELS),
            f("status", "الحالة", "select", filterable=True, values=CAMPAIGN_STATUS_LABELS),
            f("budget", "الميزانية (ر.ي)", "number", filterable=True, sortable=True),
            f("start_date", "تاريخ البداية", "date", filterable=True, sortable=True),
            f("end_date", "تاريخ النهاية", "date", filterable=True, sortable=True),
            f("notes", "ملاحظات", "text", searchable=True, filterable=True),
            f("created_at", "تاريخ الإنشاء", "datetime", sortable=True),
        ],
    ),
    EntityDef(
        key="viewings", table="viewings", label=ENTITY_LABELS["viewings"], title_field="notes", parent="properties",
        fields=[
            f("id", "المعرف", "text"),
            f("property_id", "العقار", "text", filterable=True, fk={"to": "properties", "via": "property_id"}),
            f("client_id", "العميل", "text", filterable=True, fk=None),
            f("date_time", "الموعد", "datetime", filterable=True, sortable=True),
            f("status", "الحالة", "select", filterable=True, values=VIEWING_STATUS_LABELS),
            f("notes", "ملاحظات", "text", searchable=True, filterable=True),
            f("created_at", "تاريخ الإنشاء", "datetime", sortable=True),
        ],
        names_join=NamesJoin(
            select=", p.name as property_name, c.name as client_name",
            join=" LEFT JOIN properties p ON e.property_id = p.id LEFT JOIN clients c ON e.client_id = c.id",
            search={"sql": "(p.name LIKE ? OR c.name LIKE ?)", "paramCount": 2},
        ),
    ),
    EntityDef(
        key="waypoints", table="waypoints", label=ENTITY_LABELS["waypoints"], title_field="name",
        fields=[
            f("id", "المعرف", "text"), f("name", "الاسم", "text", searchable=True, filterable=True, sortable=True),
            f("description", "الوصف", "text", searchable=True, filterable=True),
            f("latitude", "خط العرض", "number", filterable=True), f("longitude", "خط الطول", "number", filterable=True),
            f("type", "النوع", "select", filterable=True, values={"custom": "مخصص", "park": "منتزه", "land": "أرض", "home": "مسكن"}),
            f("category", "التصنيف", "select", filterable=True),
            f("tags", "الوسوم", "text", searchable=True),
            f("rating", "التقييم", "number", filterable=True, sortable=True),
            f("owner_name", "اسم المالك", "text", searchable=True, filterable=True),
            f("owner_phone", "جوال المالك", "text", searchable=True, filterable=True),
            f("owner_contact", "وسيلة اتصال", "text", searchable=True),
            f("property_details", "تفاصيل العقار", "text", searchable=True),
            f("area_sqm", "المساحة بالمتر", "number", filterable=True),
            f("price", "السعر (ر.ي)", "number", filterable=True, sortable=True),
            f("listing_date", "تاريخ الإدراج", "date", filterable=True),
            f("media_kind", "نوع الوسائط", "select", filterable=True, values={"photo": "صور", "video": "فيديو"}),
            f("media_count", "عدد الوسائط", "number", filterable=True),
            f("media", "الوسائط", "text"),
            f("created_at", "تاريخ الإنشاء", "datetime", sortable=True),
        ],
    ),
    EntityDef(
        key="areas", table="areas", label=ENTITY_LABELS["areas"], title_field="name",
        fields=[
            f("id", "المعرف", "text"), f("name", "الاسم", "text", searchable=True, filterable=True, sortable=True),
            f("description", "الوصف", "text", searchable=True, filterable=True),
            f("geojson", "الجيومتريا", "text"),
            f("area_sqm", "المساحة بالمتر", "number", filterable=True, sortable=True),
            f("perimeter_m", "المحيط بالمتر", "number", filterable=True),
            f("category", "التصنيف", "select", filterable=True),
            f("tags", "الوسوم", "text", searchable=True), f("rating", "التقييم", "number", filterable=True),
            f("media", "الوسائط", "text"), f("created_at", "تاريخ الإنشاء", "datetime", sortable=True),
        ],
    ),
    EntityDef(
        key="projects", table="projects", label=ENTITY_LABELS["projects"], title_field="name",
        custom_field_entities=True,
        fields=[
            f("id", "المعرف", "text"), f("name", "الاسم", "text", searchable=True, filterable=True, sortable=True),
            f("description", "الوصف", "text", searchable=True, filterable=True),
            f("created_at", "تاريخ الإنشاء", "datetime", sortable=True),
        ],
    ),
    EntityDef(
        key="blocks", table="blocks", label=ENTITY_LABELS["blocks"], title_field="name",
        custom_field_entities=True, parent="projects",
        fields=[
            f("id", "المعرف", "text"),
            f("project_id", "المشروع", "text", filterable=True, fk={"to": "projects", "via": "project_id"}),
            f("name", "الاسم", "text", searchable=True, filterable=True, sortable=True),
            f("plot_count", "عدد القطع", "number", filterable=True, sortable=True),
            f("notes", "ملاحظات", "text", searchable=True, filterable=True),
            f("created_at", "تاريخ الإنشاء", "datetime", sortable=True),
        ],
        names_join=NamesJoin(select=", prj.name as project_name", join=" LEFT JOIN projects prj ON e.project_id = prj.id"),
    ),
    EntityDef(
        key="plots", table="plots", label=ENTITY_LABELS["plots"], title_field="plot_no",
        custom_field_entities=True, parent="blocks",
        fields=[
            f("id", "المعرف", "text"),
            f("block_id", "البلوك", "text", filterable=True, fk={"to": "blocks", "via": "block_id"}),
            f("plot_no", "رقم القطعة", "text", searchable=True, filterable=True, sortable=True),
            f("area_sqm", "المساحة بالمتر", "number", filterable=True, sortable=True),
            f("status", "الحالة", "select", filterable=True, sortable=True, values=PLOT_STATUS_LABELS),
            f("boundary_north", "الحد الشمالي", "text", searchable=True),
            f("boundary_south", "الحد الجنوبي", "text", searchable=True),
            f("boundary_east", "الحد الشرقي", "text", searchable=True),
            f("boundary_west", "الحد الغربي", "text", searchable=True),
            f("value", "القيمة (ر.ي)", "number", filterable=True, sortable=True),
            f("buyer_name", "اسم المشتري", "text", searchable=True, filterable=True),
            f("buyer_contact", "جوال المشتري", "text", searchable=True, filterable=True),
            f("sale_date", "تاريخ البيع", "date", filterable=True, sortable=True),
            f("installment_type", "نوع التقسيط", "select", filterable=True, values=INSTALLMENT_TYPE_LABELS),
            f("paid_amount", "المدفوع (ر.ي)", "number", filterable=True, sortable=True),
            f("remaining_amount", "المتبقي (ر.ي)", "number", filterable=True, sortable=True),
            f("created_at", "تاريخ الإنشاء", "datetime", sortable=True),
            f("updated_at", "آخر تحديث", "datetime", sortable=True),
        ],
        names_join=NamesJoin(
            select=", b.name as block_name, b.project_id, prj.name as project_name",
            join=" LEFT JOIN blocks b ON e.block_id = b.id LEFT JOIN projects prj ON b.project_id = prj.id",
        ),
    ),
    EntityDef(
        key="plot_payments", table="plot_payments", label=ENTITY_LABELS["plot_payments"], title_field="pay_date",
        parent="plots",
        fields=[
            f("id", "المعرف", "text"),
            f("plot_id", "القطعة", "text", filterable=True, fk={"to": "plots", "via": "plot_id"}),
            f("amount", "المبلغ (ر.ي)", "number", filterable=True, sortable=True),
            f("pay_date", "تاريخ الدفع", "date", filterable=True, sortable=True),
            f("method", "الوسيلة", "select", filterable=True, values=PAYMENT_METHOD_LABELS),
            f("cash_recipient", "المستلم (كاش)", "text", searchable=True, filterable=True),
            f("cash_receipt_no", "رقم السند", "text", searchable=True, filterable=True),
            f("bank_name", "البنك", "text", searchable=True, filterable=True),
            f("bank_ref_no", "الرقم المرجعي", "text", searchable=True, filterable=True),
            f("created_at", "تاريخ التسجيل", "datetime", sortable=True),
        ],
        names_join=NamesJoin(
            select=", pl.plot_no as plot_no, pl.status as plot_status, pl.value as plot_value, pl.paid_amount as plot_paid, pl.remaining_amount as plot_remaining",
            join=" LEFT JOIN plots pl ON e.plot_id = pl.id",
        ),
    ),
    EntityDef(
        key="custom_fields", table="custom_fields", label=ENTITY_LABELS["custom_fields"], title_field="label",
        fields=[
            f("id", "المعرف", "text"),
            f("entity_type", "نوع الكيان", "select", filterable=True, values=ENTITY_TYPE_LABELS),
            f("label", "التسمية", "text", searchable=True, filterable=True, sortable=True),
            f("value_type", "نوع القيمة", "select", filterable=True, values=FIELD_VALUE_TYPE_LABELS),
            f("options", "الخيارات", "text", searchable=True),
            f("sort_order", "الترتيب", "number", sortable=True),
            f("created_at", "تاريخ الإنشاء", "datetime", sortable=True),
        ],
    ),
    EntityDef(
        key="custom_field_values", table="custom_field_values", label=ENTITY_LABELS["custom_field_values"], title_field="value",
        fields=[
            f("id", "المعرف", "text"),
            f("entity_type", "نوع الكيان", "select", filterable=True, values=ENTITY_TYPE_LABELS),
            f("entity_id", "الكيان", "text", filterable=True),
            f("field_id", "الحقل", "text", filterable=True),
            f("value", "القيمة", "text", searchable=True, filterable=True),
            f("created_at", "تاريخ الإنشاء", "datetime", sortable=True),
        ],
    ),
]


def get_entity_def(key: str) -> Optional[EntityDef]:
    return next((e for e in ALL_ENTITIES if e.key == key), None)


def field_options(entity: EntityDef, field_name: str) -> Optional[dict[str, str]]:
    return next((x.values for x in entity.fields if x.name == field_name and x.values), None)


def resolve_label(entity: EntityDef, row: dict) -> Optional[str]:
    v = row.get(entity.title_field)
    return str(v) if v is not None else None
