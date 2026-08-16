import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'

export const OFFER_REMINDER_CHANNEL = 'offer-reminders'

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

export interface OfferReminderDetails {
  offerId: string
  propertyName?: string
  clientName?: string
  amount?: number
}

export async function ensureOfferReminderPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(OFFER_REMINDER_CHANNEL, {
      name: 'تنبيهات العروض',
      description: 'تذكيرات مواعيد متابعة العروض العقارية',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    })
  }

  const current = await Notifications.getPermissionsAsync()
  if (current.granted || current.status === Notifications.PermissionStatus.GRANTED) return true

  const requested = await Notifications.requestPermissionsAsync()
  return requested.granted || requested.status === Notifications.PermissionStatus.GRANTED
}

export async function scheduleLocalReminder(date: Date, title: string, body: string, data: Record<string, any> = {}): Promise<string> {
  if (date.getTime() <= Date.now()) throw new Error('يجب أن يكون موعد التنبيه في المستقبل.')
  const permitted = await ensureOfferReminderPermissions()
  if (!permitted) throw new Error('لم يتم منح صلاحية الإشعارات المحلية.')

  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: OFFER_REMINDER_CHANNEL } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      ...(Platform.OS === 'android' ? { channelId: OFFER_REMINDER_CHANNEL } : {}),
    },
  })
}

export async function scheduleOfferReminder(date: Date, details: OfferReminderDetails): Promise<string> {
  const amount = details.amount ? ` بقيمة ${details.amount.toLocaleString('ar-YE')} ريال يمني` : ''
  const property = details.propertyName || 'العرض العقاري'
  const client = details.clientName ? ` مع ${details.clientName}` : ''
  return scheduleLocalReminder(
    date,
    'تذكير بمتابعة عرض عقاري',
    `${property}${client}${amount}`,
    { type: 'offer-reminder', offerId: details.offerId },
  )
}

export async function cancelLocalReminder(notificationId?: string | null): Promise<void> {
  if (!notificationId || Platform.OS === 'web') return
  await Notifications.cancelScheduledNotificationAsync(notificationId)
}

export const cancelOfferReminder = cancelLocalReminder
