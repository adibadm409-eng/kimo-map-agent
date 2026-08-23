import React from 'react'

export type HeaderCtxValue = {
  right: React.ReactNode | null
  setRight: (node: React.ReactNode | null) => void
}

export const HeaderCtx = React.createContext<HeaderCtxValue>({
  right: null,
  setRight: () => {},
})
