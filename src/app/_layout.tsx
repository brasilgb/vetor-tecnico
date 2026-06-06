import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/lib/session-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" backgroundColor="transparent" translucent />
        <Stack
          initialRouteName="index"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0b1220' },
          }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="home" />
          <Stack.Screen name="agendamentos/[id]" />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}