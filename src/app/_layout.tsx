import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppHeader from '@/components/app-header';
import { SessionProvider } from '@/lib/session-context';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <StatusBar style="light" backgroundColor="#15365f" />
          <Stack
            initialRouteName="index"
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#0b1220' },
            }}>
            <Stack.Screen name="index" />
            <Stack.Screen
              name="home"
              options={{
                headerShown: true,
                header: () => <AppHeader user logout />,
              }}
            />
            <Stack.Screen
              name="agendamentos/[id]"
              options={{
                headerShown: true,
                header: () => <AppHeader back close />,
              }}
            />
          </Stack>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
