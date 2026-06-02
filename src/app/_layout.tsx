import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import AppHeader from '@/components/app-header';
import { SessionProvider } from '@/lib/session-context';

export default function RootLayout() {
  return (
    <SessionProvider>
      <Stack
        initialRouteName="index"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0b1220' },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: true,
            header: () => <AppHeader user logout />,
          }}
        />
      </Stack>
      <StatusBar style="light" translucent />
    </SessionProvider>
  );
}
