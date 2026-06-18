// Keep this import first so Metro/Fast Refresh is initialized before the app.
import '@expo/metro-runtime';

import { AppRegistry, LogBox, Platform } from 'react-native';
import { App } from 'expo-router/build/qualified-entry';

LogBox.ignoreLogs([
  'Unable to activate keep awake',
  'Error: Unable to activate keep awake',
]);

AppRegistry.registerComponent('main', () => App);

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const rootTag = document.getElementById('root');

  if (rootTag) {
    AppRegistry.runApplication('main', { rootTag });
  }
}
