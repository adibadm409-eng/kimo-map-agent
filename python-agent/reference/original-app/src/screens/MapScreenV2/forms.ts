import type { WaypointForm, AreaForm } from "./types"

export type { WaypointForm, AreaForm }

export function emptyWpForm(): WaypointForm {
  return {
    name: "",
    description: "",
    category: "general",
    rating: 0,
    ownerName: "",
    ownerPhone: "",
    ownerContact: "",
    details: "",
    area: "",
    price: "",
    listingDate: new Date().toISOString().substring(0, 10),
    mediaKind: "photo",
    mediaUris: [],
  }
}

export function emptyAreaForm(): AreaForm {
  return { name: "", description: "", category: "general", rating: 0 }
}
