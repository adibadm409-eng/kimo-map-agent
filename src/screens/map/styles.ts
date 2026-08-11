import { StyleSheet, Dimensions } from "react-native"
import { spacing, radius, fontSize } from "../../theme/tokens"

const { width: SW } = Dimensions.get("window")

/**
 * Styles used by `map/modals/*` and `map/drawers/*`.
 * Kept intentionally minimal — MapScreen uses its own local StyleSheet
 * and the new tools registry renders previews inline.
 *
 * Anything not referenced by those subfolders is dead code and removed.
 */
export const styles = StyleSheet.create({
  // ---- Modals (shared by SaveWaypointModal / SaveAreaModal / GpsPickerModal) ----
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: spacing.xl },
  modalContent: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  modalTitle: { fontSize: fontSize.xl, fontWeight: "700", fontFamily: "Tajawal_700Bold", marginBottom: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: fontSize.md, fontFamily: "Tajawal_400Regular", textAlign: "right" },

  // ---- Drawer Panels (left slide-in panels) ----
  drawerPanel: { position: "absolute", left: 0, top: 0, bottom: 0, width: SW * 0.82, zIndex: 150, backgroundColor: "rgba(15,23,42,0.97)", elevation: 12 },
  drawerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.1)" },
  drawerTitle: { fontSize: fontSize.lg, fontWeight: "700", fontFamily: "Tajawal_700Bold", color: "#FFFFFF" },
  drawerCloseBtn: { padding: spacing.xs },
  drawerContent: { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  drawerSection: { marginBottom: spacing.md, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.1)" },
  drawerSectionTitle: { fontSize: fontSize.md, fontWeight: "700", fontFamily: "Tajawal_700Bold", marginBottom: spacing.sm, color: "#FFFFFF" },
  drawerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  drawerLabel: { fontSize: fontSize.sm, fontFamily: "Tajawal_500Medium", color: "#CBD5E1" },
  drawerValue: { fontSize: fontSize.sm, fontWeight: "700", fontFamily: "Tajawal_700Bold", color: "#FFFFFF" },

  // ---- Layer Items (used in LayersDrawer-like UIs) ----
  layerItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", marginBottom: spacing.xs },
  layerItemActive: { borderColor: "#3B82F6" },
  layerItemName: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#FFFFFF", flex: 1 },
  layerItemDesc: { fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", color: "#94A3B8" },

  // ---- Waypoint Items (drawer lists) ----
  waypointItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.06)" },
  waypointName: { fontSize: fontSize.sm, fontWeight: "700", fontFamily: "Tajawal_700Bold", color: "#FFFFFF", flex: 1 },
  waypointCoords: { fontSize: fontSize.xs, fontFamily: "monospace", color: "#64748B" },
  waypointDelete: { padding: spacing.xs },

  // ---- Opacity Bar / Buttons ----
  opacityBar: { height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.1)" },
  opacityFill: { height: "100%", borderRadius: 4, backgroundColor: "#3B82F6" },
  opacityBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center" },
  opacityBtnText: { fontSize: fontSize.md, fontWeight: "700", fontFamily: "Tajawal_700Bold", color: "#FFFFFF" },

  // ---- Search Drawer ----
  searchInputDrawer: { borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: fontSize.md, fontFamily: "Tajawal_400Regular", textAlign: "right", backgroundColor: "rgba(255,255,255,0.05)", color: "#FFFFFF", marginBottom: spacing.sm },
  searchBtnDrawer: { backgroundColor: "#3B82F6", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.full, alignItems: "center", marginBottom: spacing.sm },
  searchBtnText: { color: "#FFFFFF", fontSize: fontSize.md, fontWeight: "700", fontFamily: "Tajawal_700Bold", textAlign: "center" },

  // ---- Toggle Switch ----
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  toggleLabel: { fontSize: fontSize.md, fontFamily: "Tajawal_500Medium", color: "#CBD5E1" },
  toggleTrack: { width: 44, height: 24, borderRadius: 12, justifyContent: "center", paddingHorizontal: 3, backgroundColor: "rgba(255,255,255,0.1)" },
  toggleTrackActive: { backgroundColor: "#3B82F6" },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#FFFFFF" },

  // ---- Stat readouts ----
  statLabel: { fontSize: fontSize.xs, fontFamily: "Tajawal_400Regular", color: "#94A3B8" },
  statValue: { fontSize: fontSize.md, fontWeight: "700", fontFamily: "Tajawal_700Bold", color: "#FFFFFF" },

  // ---- Generic draw button row (used inside drawers) ----
  drawBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", marginBottom: spacing.xs },
  drawBtnText: { fontSize: fontSize.sm, fontFamily: "Tajawal_700Bold", color: "#FFFFFF" },
  drawBtnActive: { backgroundColor: "rgba(59,130,246,0.2)", borderColor: "#3B82F6" },
})
