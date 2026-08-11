import { registerRootComponent } from 'expo';

// exceljs يتطلب توابع Node عامة (Buffer/process/setImmediate) غير متوفرة بنيوياً على
// Hermes/React Native. تضمين هذه الـ polyfills قبل تحميل أي وحدة يجنّب انفجار
// "Maximum call stack size exceeded" عند استيراد exceljs أو قراءة/توليد ملفات Excel.
import 'setimmediate';
import { Buffer } from 'buffer';
if (global.Buffer === undefined) {
  global.Buffer = Buffer;
}
if ((global as any).process === undefined) {
  (global as any).process = {
    env: {},
    platform: '',
    browser: false,
    nextTick: (cb: () => void) => setImmediate(cb),
  };
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
