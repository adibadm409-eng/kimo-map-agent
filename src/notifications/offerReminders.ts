import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'

export const OFFER_REMINDER_CHANNEL = 'offer-reminders'

let notificationsAvailable = true

if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    })
  } catch {
    notificationsAvailable = false
  }
}

export interface OfferReminderDetails {
  offerId: string
  propertyName?: string
  clientName?: string
  amount?: number
}

export async function ensureOfferReminderPermissions(): Promise<boolean> {
  if (Platform.OS === 'web' || !notificationsAvailable) return false

  try {
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
  } catch {
    return false
  }
}

export async function scheduleLocalReminder(date: Date, title: string, body: string, data: Record<string, any> = {}): Promise<string> {
  if (date.getTime() <= Date.now()) throw new Error('يجب أن يكون موعد التنبيه في المستقبل.')
  if (!notificationsAvailable) throw new Error('الإشعارات المحلية غير متاحة على هذا الجهاز.')
  const permitted = await ensureOfferReminderPermissions()
  if (!permitted) throw new Error('لم يتم منح صلاحية الإشعارات المحلية.')

  try {
    return await Notifications.scheduleNotificationAsync({
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
  } catch {
    throw new Error('تعذّر جدولة التنبيه المحلي على هذا الجهاز.')
  }
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
  if (!notificationId || Platform.OS === 'web' || !notificationsAvailable) return
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId)
  } catch {
    // ignore cancellation failures
  }
}

export const cancelOfferReminder = cancelLocalReminder
