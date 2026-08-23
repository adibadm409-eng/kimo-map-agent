export type ThemeMode = 'light' | 'dark'

export interface ThemeColors {
  bg: string
  bgSecondary: string
  bgCard: string
  bgCardHover: string
  surface: string
  border: string
  borderHover: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  accent: string
  accentHover: string
  accentSurface: string
  success: string
  successSurface: string
  warning: string
  warningSurface: string
  error: string
  errorSurface: string
  info: string
  infoSurface: string
}

export const lightTheme: ThemeColors = {
  bg: '#F8FAFC',
  bgSecondary: '#FFFFFF',
  bgCard: '#FFFFFF',
  bgCardHover: '#F8FAFC',
  surface: '#F1F5F9',
  border: '#E2E8F0',
  borderHover: '#CBD5E1',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  accent: '#2563EB',
  accentHover: '#1D4ED8',
  accentSurface: '#EFF6FF',
  success: '#16A34A',
  successSurface: '#F0FDF4',
  warning: '#D97706',
  warningSurface: '#FFFBEB',
  error: '#DC2626',
  errorSurface: '#FEF2F2',
  info: '#0891B2',
  infoSurface: '#ECFEFF',
}

export const darkTheme: ThemeColors = {
  bg: '#0B1120',
  bgSecondary: '#111827',
  bgCard: '#162032',
  bgCardHover: '#1C2A42',
  surface: '#1E293B',
  border: '#1E293B',
  borderHover: '#334155',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  accent: '#3B82F6',
  accentHover: '#60A5FA',
  accentSurface: 'rgba(59,130,246,0.12)',
  success: '#22C55E',
  successSurface: 'rgba(34,197,94,0.1)',
  warning: '#F59E0B',
  warningSurface: 'rgba(245,158,11,0.1)',
  error: '#EF4444',
  errorSurface: 'rgba(239,68,68,0.1)',
  info: '#06B6D4',
  infoSurface: 'rgba(6,182,212,0.1)',
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
}

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 14,
  lg: 16,
  xl: 19,
  xxl: 23,
  xxxl: 28,
}

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
}

import { Dimensions, Platform } from 'react-native'

export const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
export const isSmallScreen = SCREEN_WIDTH < 380
export const isTablet = SCREEN_WIDTH >= 768

export function wp(percentage: number): number {
  return (percentage / 100) * SCREEN_WIDTH
}
export function hp(percentage: number): number {
  return (percentage / 100) * SCREEN_HEIGHT
}

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
}
