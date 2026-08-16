import React from 'react'
import { View, Text, I18nManager, ActivityIndicator, StyleSheet, Pressable } from 'react-native'
import { NavigationContainer, DarkTheme as NavDark, DefaultTheme as NavLight } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Ionicons } from '@expo/vector-icons'
import { useFonts } from 'expo-font'
import { Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold } from '@expo-google-fonts/tajawal'

import { ThemeProvider, useTheme } from './src/theme/ThemeContext'
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

function PropertiesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PropertiesList" component={Properties} />
      <Stack.Screen name="PropertyDetail" component={PropertyDetail} />
      <Stack.Screen name="PropertyForm" component={PropertyForm} />
    </Stack.Navigator>
  )
}

function ClientsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ClientsList" component={Clients} />
      <Stack.Screen name="ClientDetail" component={ClientDetail} />
      <Stack.Screen name="ClientForm" component={ClientForm} />
    </Stack.Navigator>
  )
}

function OffersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OffersList" component={Offers} />
      <Stack.Screen name="OfferForm" component={OfferForm} />
    </Stack.Navigator>
  )
}

function ProjectsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProjectsList" component={ProjectsScreen} />
      <Stack.Screen name="ProjectForm" component={ProjectForm} />
      <Stack.Screen name="ProjectDetail" component={ProjectDetail} />
      <Stack.Screen name="BlockForm" component={BlockForm} />
      <Stack.Screen name="BlockDetail" component={BlockDetail} />
      <Stack.Screen name="PlotDetail" component={PlotDetail} />
      <Stack.Screen name="PaymentForm" component={PaymentForm} />
      <Stack.Screen name="CustomFields" component={CustomFields} />
      <Stack.Screen name="ProjectsSearch" component={SearchScreen} />
      <Stack.Screen name="ProjectReports" component={ReportsScreen} />
      <Stack.Screen name="WorkspacesList" component={WorkspacesScreen} />
      <Stack.Screen name="WorkspaceDetail" component={WorkspaceDetail} />
    </Stack.Navigator>
  )
}

function MoreMenuScreen({ navigation }: any) {
  const { colors } = useTheme()
  const menuItems = [
    { label: 'أدوات التصدير والاستيراد', icon: 'cloud-upload-outline', screen: 'ToolsExport', color: '#0EA5E9' },
    { label: 'النسخ الاحتياطية', icon: 'archive-outline', screen: 'BackupManager', color: '#8B5CF6' },
    { label: 'المشاهدات', icon: 'calendar-outline', screen: 'ViewingsList', color: '#3B82F6' },
    { label: 'التذكيرات', icon: 'alarm-outline', screen: 'Reminders', color: '#0EA5E9' },
    { label: 'الحملات', icon: 'megaphone-outline', screen: 'CampaignsList', color: '#7C3AED' },
    { label: 'التقارير', icon: 'bar-chart-outline', screen: 'ReportsMain', color: '#16A34A' },
    { label: 'الإعدادات', icon: 'settings-outline', screen: 'Settings', color: '#64748B' },
    { label: 'حقوق الملكية', icon: 'shield-checkmark-outline', screen: 'About', color: '#C0C0C0' },
  ]
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.moreHeader, { paddingTop: 50, paddingHorizontal: 20, paddingBottom: 16, borderBottomColor: colors.border }]}>
        <Text style={[styles.moreTitle, { color: colors.textPrimary }]}>المزيد</Text>
      </View>
      <View style={styles.moreList}>
        {menuItems.map((item, i) => (
          <View key={i} style={[styles.moreItem, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={() => navigation.navigate(item.screen)}
              style={({ pressed }) => [styles.moreItemInner, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.moreIcon, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
              </View>
              <Text style={[styles.moreLabel, { color: colors.textPrimary }]}>{item.label}</Text>
              <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  )
}

function MoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MoreMenu" component={MoreMenuScreen} />
      <Stack.Screen name="ViewingsList" component={Viewings} />
      <Stack.Screen name="Reminders" component={Reminders} />
      <Stack.Screen name="ViewingForm" component={ViewingForm} />
      <Stack.Screen name="CampaignsList" component={Campaigns} />
      <Stack.Screen name="CampaignForm" component={CampaignForm} />
      <Stack.Screen name="ReportsMain" component={Reports} />
      <Stack.Screen name="Settings" component={Settings} />
      <Stack.Screen name="MapSettings" component={MapSettings} />
      <Stack.Screen name="MapKeysSettings" component={MapKeysSettings} />
      <Stack.Screen name="ToolsExport" component={ToolsScreen} />
      <Stack.Screen name="BackupManager" component={BackupManagerScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
    </Stack.Navigator>
  )
}

function AssistantStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AssistantMain" component={AssistantScreen} />
      <Stack.Screen name="AgentSettings" component={AgentSettings} />
      <Stack.Screen name="CustomProviderEditor" component={CustomProviderEditor} />
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
        options={{ tabBarLabel: 'الخريطة', tabBarIcon: ({color, size}) => <Ionicons name="map-outline" size={size} color={color} /> }}
      />
      <Tab.Screen name="ProjectsStack" component={ProjectsStack}
        options={{ tabBarLabel: 'المشاريع', tabBarIcon: ({color, size}) => <Ionicons name="business-outline" size={size} color={color} /> }}
      />
      <Tab.Screen name="AssistantStack" component={AssistantStack}
        options={{ tabBarLabel: 'المساعد', tabBarIcon: ({color, size}) => <Ionicons name="sparkles-outline" size={size} color={color} /> }}
      />
      <Tab.Screen name="MoreStack" component={MoreStack}
        options={{ tabBarLabel: 'المزيد', tabBarIcon: ({color, size}) => <Ionicons name="apps-outline" size={size} color={color} /> }}
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
      <Tabs />
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
  const [fontsLoaded] = useFonts({
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
    Tajawal_800ExtraBold,
  })

  if (!fontsLoaded) {
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
})