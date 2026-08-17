export const Platform = { OS: 'android', select: <T>(options: Record<string, T>) => options.android ?? options.default }
export const I18nManager = { isRTL: true, forceRTL: () => {}, allowRTL: () => {} }
export const Appearance = { getColorScheme: () => 'dark', addChangeListener: () => ({ remove: () => {} }) }
export const Dimensions = { get: () => ({ width: 1080, height: 1920 }) }
export const Keyboard = { addListener: () => ({ remove: () => {} }) }
export const Linking = { openURL: async () => {} }
export const Alert = { alert: () => {} }
export const StyleSheet = { create: <T>(styles: T) => styles, hairlineWidth: 1 }
export const NativeModules = {}
export const AppState = { addEventListener: () => ({ remove: () => {} }) }
export const InteractionManager = { runAfterInteractions: (callback: () => void) => { callback(); return { cancel: () => {} } } }
export const useColorScheme = () => 'dark'
export const useWindowDimensions = () => ({ width: 1080, height: 1920, scale: 1, fontScale: 1 })
export const View = 'View'
export const Text = 'Text'
export const TextInput = 'TextInput'
export const Pressable = 'Pressable'
export const ScrollView = 'ScrollView'
export const FlatList = 'FlatList'
export const Modal = 'Modal'
export const ActivityIndicator = 'ActivityIndicator'
export const KeyboardAvoidingView = 'KeyboardAvoidingView'
export const TouchableOpacity = 'TouchableOpacity'
export const SafeAreaView = 'SafeAreaView'
export const useState = () => undefined
export const useEffect = () => undefined
export const useMemo = (factory: () => unknown) => factory()
export const useCallback = (callback: (...args: any[]) => any) => callback
export const useRef = (value: unknown) => ({ current: value })
export const useReducer = () => [undefined, () => {}]
export const forwardRef = (component: unknown) => component
export const createContext = () => ({ Provider: 'Provider', Consumer: 'Consumer' })
export const useContext = () => undefined
export default { Platform }
