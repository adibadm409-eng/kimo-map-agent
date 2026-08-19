import React from 'react'
import { View, Text, I18nManager, ActivityIndicator, StyleSheet, Pressable, Animated, Dimensions, ScrollView } from 'react-native'
import { NavigationContainer, DarkTheme as NavDark, DefaultTheme as NavLight, useNavigation, useNavigationState } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Ionicons } from '@expo/vector-icons'
import { useFonts } from 'expo-font'
import { Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold } from '@expo-google-fonts/tajawal'

import { ThemeProvider, useTheme } from './src/theme/ThemeContext'
import { HeaderCtx } from './src/navigation/headerContext'
import './src/agent'

I18nManager.forceRTL(true)
I18nManager.allowRTL(true)

import Properties from './src/screens/Properties'
import PropertyDetail from './src/screens/PropertyDetail'
import PropertyForm from './src/screens/PropertyForm'
import Clients from './src/screens/Clients'
import ClientDetail from './src/screens/ClientDetail'
import ClientForm from './src/screens/ClientForm'
import Offers from './src/screens/Offers'
import OfferForm from './src/screens/OfferForm'
import Viewings from './src/screens/Viewings'
import ViewingForm from './src/screens/ViewingForm'
import Campaigns from './src/screens/Campaigns'
import CampaignForm from './src/screens/CampaignForm'
import Reports from './src/screens/Reports'
import Settings from './src/screens/Settings'
import ToolsScreen from './src/screens/Tools'
import KimoOperationsScreen from './src/screens/KimoOperations'
import BackupManagerScreen from './src/screens/BackupManager'
import AboutScreen from './src/screens/AboutScreen'
import Reminders from './src/screens/Reminders'
import MapSettings from './src/screens/map/MapSettings'
import MapKeysSettings from './src/screens/map/MapKeysSettings'
import MapScreen from './src/screens/MapScreen'
import ProjectsScreen from './src/screens/projects/ProjectsScreen'
import ProjectForm from './src/screens/projects/ProjectForm'
import ProjectDetail from './src/screens/projects/ProjectDetail'
import BlockForm from './src/screens/projects/BlockForm'
import BlockDetail from './src/screens/projects/BlockDetail'
import PlotDetail from './src/screens/projects/PlotDetail'
import PaymentForm from './src/screens/projects/PaymentForm'
import CustomFields from './src/screens/projects/CustomFields'
import SearchScreen from './src/screens/projects/SearchScreen'
import ReportsScreen from './src/screens/projects/ReportsScreen'
import AssistantScreen from './src/screens/assistant/AssistantScreen'
import AgentSettings from './src/screens/assistant/AgentSettings'
import CustomProviderEditor from './src/screens/assistant/CustomProviderEditor'
import WorkspacesScreen from './src/screens/workspace/WorkspacesScreen'
import WorkspaceDetail from './src/screens/workspace/WorkspaceDetail'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()
const Root = createNativeStackNavigator()

function PropertiesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PropertiesList" component={Properties} options={{ title: 'العقارات' }} />
      <Stack.Screen name="PropertyDetail" component={PropertyDetail} options={{ title: 'تفاصيل العقار' }} />
      <Stack.Screen name="PropertyForm" component={PropertyForm} options={{ title: 'عقار' }} />
    </Stack.Navigator>
  )
}

function ClientsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientsList" component={Clients} options={{ title: 'العملاء' }} />
      <Stack.Screen name="ClientDetail" component={ClientDetail} options={{ title: 'تفاصيل العميل' }} />
      <Stack.Screen name="ClientForm" component={ClientForm} options={{ title: 'عميل' }} />
    </Stack.Navigator>
  )
}

function OffersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OffersList" component={Offers} options={{ title: 'العروض' }} />
      <Stack.Screen name="OfferForm" component={OfferForm} options={{ title: 'عرض' }} />
    </Stack.Navigator>
  )
}

function ProjectsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProjectsList" component={ProjectsScreen} options={{ title: 'المشاريع' }} />
      <Stack.Screen name="ProjectForm" component={ProjectForm} options={{ title: 'مشروع' }} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetail} options={{ title: 'تفاصيل المشروع' }} />
      <Stack.Screen name="BlockForm" component={BlockForm} options={{ title: 'بلوك' }} />
      <Stack.Screen name="BlockDetail" component={BlockDetail} options={{ title: 'تفاصيل البلوك' }} />
      <Stack.Screen name="PlotDetail" component={PlotDetail} options={{ title: 'تفاصيل القطعة' }} />
      <Stack.Screen name="PaymentForm" component={PaymentForm} options={{ title: 'دفعة' }} />
      <Stack.Screen name="CustomFields" component={CustomFields} options={{ title: 'حقول مخصصة' }} />
      <Stack.Screen name="ProjectsSearch" component={SearchScreen} options={{ title: 'بحث المشاريع' }} />
      <Stack.Screen name="ProjectReports" component={ReportsScreen} options={{ title: 'تقرير المشروع' }} />
      <Stack.Screen name="WorkspacesList" component={WorkspacesScreen} options={{ title: 'مساحات العمل' }} />
      <Stack.Screen name="WorkspaceDetail" component={WorkspaceDetail} options={{ title: 'تفاصيل مساحة العمل' }} />
    </Stack.Navigator>
  )
}

type SideItem = { label: string; icon: string; screen: string; color: string } | { divider: true }

const SIDE_ITEMS: SideItem[] = [
  { label: 'المشاريع', icon: 'business-outline', screen: 'Projects', color: '#3B82F6' },
  { divider: true },
  { label: 'التقارير', icon: 'bar-chart-outline', screen: 'ReportsMain', color: '#16A34A' },
  { label: 'أدوات التصدير والاستيراد', icon: 'cloud-upload-outline', screen: 'ToolsExport', color: '#0EA5E9' },
  { label: 'النسخ الاحتياطية', icon: 'archive-outline', screen: 'BackupManager', color: '#8B5CF6' },
  { divider: true },
  { label: 'إشراف Kimo وسجل العمليات', icon: 'shield-checkmark-outline', screen: 'KimoOperations', color: '#16A34A' },
  { label: 'المشاهدات', icon: 'calendar-outline', screen: 'ViewingsList', color: '#3B82F6' },
  { label: 'التذكيرات', icon: 'alarm-outline', screen: 'Reminders', color: '#0EA5E9' },
  { label: 'الحملات', icon: 'megaphone-outline', screen: 'CampaignsList', color: '#7C3AED' },
  { divider: true },
  { label: 'الإعدادات', icon: 'settings-outline', screen: 'Settings', color: '#64748B' },
  { label: 'حقوق الملكية', icon: 'shield-checkmark-outline', screen: 'About', color: '#94A3B8' },
]

const SideMenuCtx = React.createContext<{ visible: boolean; open: () => void; close: () => void }>({
  visible: false,
  open: () => {},
  close: () => {},
})

function SideMenuProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = React.useState(false)
  const value = React.useMemo(
    () => ({ visible, open: () => setVisible(true), close: () => setVisible(false) }),
    [visible],
  )
  return <SideMenuCtx.Provider value={value}>{children}</SideMenuCtx.Provider>
}

function useSideMenu() {
  return React.useContext(SideMenuCtx)
}

function MenuButton() {
  const { colors } = useTheme()
  const { open } = useSideMenu()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="القائمة الجانبية"
      onPress={open}
      style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="menu-outline" size={24} color={colors.textPrimary} />
    </Pressable>
  )
}

function HeaderAddButton({ onPress, label }: { onPress: () => void; label?: string }) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? 'إضافة'}
      onPress={onPress}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="add" size={22} color="#fff" />
    </Pressable>
  )
}

function AppHeader({ options }: any) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const title = options?.title
  const Right = options?.headerRight
  return (
    <View style={{ paddingTop: insets.top, paddingBottom: 8, paddingHorizontal: 12, backgroundColor: colors.bgSecondary, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <MenuButton />
      <Text style={{ flex: 1, fontSize: 18, fontFamily: 'Tajawal_800ExtraBold', color: colors.textPrimary }} numberOfLines={1}>{title}</Text>
      <View style={{ alignItems: 'center', justifyContent: 'center', flexShrink: 1 }}>
        {Right ? (typeof Right === 'function' ? <Right /> : Right) : null}
      </View>
    </View>
  )
}

function SideMenuOverlay() {
  const { colors } = useTheme()
  const { visible, close } = useSideMenu()
  const navigation = useNavigation<any>()
  const insets = useSafeAreaInsets()
  const translate = React.useRef(new Animated.Value(1)).current
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    if (visible) {
      setMounted(true)
      Animated.timing(translate, { toValue: 0, duration: 220, useNativeDriver: true }).start()
    } else if (mounted) {
      Animated.timing(translate, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => setMounted(false))
    }
  }, [visible])

  const panelWidth = Math.min(Dimensions.get('window').width * 0.8, 320)
  if (!mounted && !visible) return null

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="إغلاق القائمة" onPress={close} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: panelWidth,
          backgroundColor: colors.bgSecondary,
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderLeftColor: colors.border,
          transform: [{ translateX: translate.interpolate({ inputRange: [0, 1], outputRange: [0, panelWidth] }) }],
        }}
      >
        <View style={[styles.sideHeader, { paddingTop: insets.top + 14, borderBottomColor: colors.border }]}>
          <Text style={[styles.sideTitle, { color: colors.textPrimary }]}>القائمة</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="إغلاق" onPress={close} style={({ pressed }) => [styles.sideClose, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }}>
          {SIDE_ITEMS.map((it, i) =>
            'divider' in it ? (
              <View key={i} style={[styles.sideDivider, { backgroundColor: colors.border }]} />
            ) : (
              <Pressable
                key={i}
                onPress={() => {
                  navigation.navigate((it as Exclude<SideItem, { divider: true }>).screen)
                  close()
                }}
                style={({ pressed }) => [styles.sideItem, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.sideIcon, { backgroundColor: (it as Exclude<SideItem, { divider: true }>).color + '15' }]}>
                  <Ionicons name={(it as Exclude<SideItem, { divider: true }>).icon as any} size={20} color={(it as Exclude<SideItem, { divider: true }>).color} />
                </View>
                <Text style={[styles.sideLabel, { color: colors.textPrimary }]}>{(it as Exclude<SideItem, { divider: true }>).label}</Text>
                <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
              </Pressable>
            ),
          )}
        </ScrollView>
      </Animated.View>
    </View>
  )
}

function AssistantStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AssistantMain" component={AssistantScreen} options={{ title: 'كيمو' }} />
      <Stack.Screen name="AgentSettings" component={AgentSettings} options={{ title: 'إعدادات المساعد' }} />
      <Stack.Screen name="CustomProviderEditor" component={CustomProviderEditor} options={{ title: 'مزوّد مخصص' }} />
    </Stack.Navigator>
  )
}

function Tabs() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bgSecondary,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingBottom: insets.bottom + 4,
          paddingTop: 8,
          elevation: 0,
        },
        headerShown: false,
        tabBarLabelStyle: { fontFamily: 'Tajawal_700Bold', fontSize: 12 },
        animation: 'fade',
      }}
    >
      <Tab.Screen name="PropertiesStack" component={PropertiesStack}
        options={{ tabBarLabel: 'العقارات', tabBarIcon: ({color, size}) => <Ionicons name="business-outline" size={size} color={color} /> }}
      />
      <Tab.Screen name="ClientsStack" component={ClientsStack}
        options={{ tabBarLabel: 'العملاء', tabBarIcon: ({color, size}) => <Ionicons name="people-outline" size={size} color={color} /> }}
      />
      <Tab.Screen name="OffersStack" component={OffersStack}
        options={{ tabBarLabel: 'العروض', tabBarIcon: ({color, size}) => <Ionicons name="pricetags-outline" size={size} color={color} /> }}
      />
      <Tab.Screen name="MapScreen" component={MapScreen}
        options={{ tabBarLabel: 'الخريطة', title: 'الخريطة', tabBarIcon: ({color, size}) => <Ionicons name="map-outline" size={size} color={color} /> }}
      />
      <Tab.Screen name="AssistantStack" component={AssistantStack}
        options={{ tabBarLabel: 'المساعد', tabBarIcon: ({color, size}) => <Ionicons name="sparkles-outline" size={size} color={color} /> }}
      />
    </Tab.Navigator>
  )
}

function RootNav() {
  const { mode, colors } = useTheme()
  const navTheme = {
    ...(mode === 'dark' ? NavDark : NavLight),
    colors: {
      ...(mode === 'dark' ? NavDark.colors : NavLight.colors),
      background: colors.bg,
      card: colors.bgSecondary,
      text: colors.textPrimary,
      border: colors.border,
      primary: colors.accent,
      notification: colors.error,
    },
  }
  return (
    <NavigationContainer theme={navTheme}>
      <SideMenuProvider>
        <Root.Navigator initialRouteName="Tabs" screenOptions={{ headerShown: true, header: (props: any) => <AppHeader {...props} /> }}>
          <Root.Screen name="Tabs" component={Tabs} />
          <Root.Screen name="Projects" component={ProjectsStack} />
          <Root.Screen name="KimoOperations" component={KimoOperationsScreen} options={{ title: 'إشراف Kimo وسجل العمليات' }} />
          <Root.Screen name="ToolsExport" component={ToolsScreen} options={{ title: 'الأدوات والاستيراد' }} />
          <Root.Screen name="BackupManager" component={BackupManagerScreen} options={{ title: 'النسخ الاحتياطية' }} />
          <Root.Screen name="ViewingsList" component={Viewings} options={{ title: 'المشاهدات' }} />
          <Root.Screen name="ViewingForm" component={ViewingForm} options={{ title: 'مشاهدة' }} />
          <Root.Screen name="CampaignsList" component={Campaigns} options={{ title: 'الحملات' }} />
          <Root.Screen name="CampaignForm" component={CampaignForm} options={{ title: 'حملة' }} />
          <Root.Screen name="Reminders" component={Reminders} options={{ title: 'التذكيرات' }} />
          <Root.Screen name="ReportsMain" component={Reports} options={{ title: 'التقارير' }} />
          <Root.Screen name="Settings" component={Settings} options={{ title: 'الإعدادات' }} />
          <Root.Screen name="MapSettings" component={MapSettings} options={{ title: 'مزوّدو الخرائط' }} />
          <Root.Screen name="MapKeysSettings" component={MapKeysSettings} options={{ title: 'المفاتيح المطلوبة' }} />
          <Root.Screen name="About" component={AboutScreen} options={{ title: 'حقوق الملكية' }} />
        </Root.Navigator>
        <SideMenuOverlay />
      </SideMenuProvider>
    </NavigationContainer>
  )
}

function LoadingScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
      <ActivityIndicator size="large" color="#2563EB" />
      <Text style={{ marginTop: 16, fontSize: 16, color: '#64748B', fontFamily: 'Tajawal_400Regular' }}>جاري التحميل...</Text>
    </View>
  )
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
    Tajawal_800ExtraBold,
  })
  const [fontsTimeout, setFontsTimeout] = React.useState(false)

  React.useEffect(() => {
    const t = setTimeout(() => setFontsTimeout(true), 8000)
    return () => clearTimeout(t)
  }, [])

  const fontsReady = fontsLoaded || !!fontError || fontsTimeout

  if (!fontsReady) {
    return <LoadingScreen />
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <RootNav />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  moreHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  moreTitle: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'Tajawal_700Bold',
  },
  moreList: {
    flex: 1,
  },
  moreItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  moreItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 16,
  },
  moreIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Tajawal_700Bold',
  },
  sideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sideTitle: {
    fontSize: 18,
    fontFamily: 'Tajawal_800ExtraBold',
  },
  sideClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 6,
  },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 12,
  },
  sideIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Tajawal_700Bold',
  },
})