// إعلان نوعي لمسار exceljs البديل الذي نستورده ديناميكياً في Hermes بدل الحزمة
// المنسقة الكبيرة التي تنفجر في React Native. نفس نوع الحزمة الأصلية.
declare module 'exceljs/dist/exceljs.bare.js' {
  export { Workbook, ValueType, FormulaType, RelationshipType, DocumentType, ReadingOrder, ErrorValue } from 'exceljs'
}
