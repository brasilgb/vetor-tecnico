import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 16);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#00b4ff',
        tabBarInactiveTintColor: '#a8b3c7',
        tabBarStyle: {
          height: 58 + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
          backgroundColor: '#101a2d',
          borderTopColor: 'rgba(245, 244, 239, 0.12)',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Atendimento',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="clientes"
        options={{
          title: 'Clientes',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="groups" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orcamentos"
        options={{
          title: 'Orçamentos',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="description" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
