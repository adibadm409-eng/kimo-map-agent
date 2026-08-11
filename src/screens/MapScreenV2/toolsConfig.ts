import type { ToolMeta, ToolId } from "./types"

export const TOOLS: ToolMeta[] = [
  {
    id: "marker",
    icon: "location",
    label: "علامة",
    color: "#EF4444",
    hint: "ضع علامة موقع عند مركز الشاشة",
  },
  {
    id: "measure",
    icon: "resize",
    label: "قياس",
    color: "#8B5CF6",
    hint: "قياس حيّ من نقطة البداية المثبتة إلى مركز الشاشة",
  },
  {
    id: "polygon",
    icon: "shapes",
    label: "مساحة",
    color: "#3B82F6",
    hint: "ارسم حدود مساحة",
  },
  {
    id: "polyline",
    icon: "git-branch",
    label: "مسار",
    color: "#10B981",
    hint: "ارسم خط مسار",
  },
  {
    id: "eraser",
    icon: "trash",
    label: "محو",
    color: "#6B7280",
    hint: "احذف النقاط المرسومة",
  },
]

export const TOOL_BY_ID: Record<ToolId, ToolMeta> = TOOLS.reduce(
  (acc, t) => ({ ...acc, [t.id]: t }),
  {} as Record<ToolId, ToolMeta>,
)
