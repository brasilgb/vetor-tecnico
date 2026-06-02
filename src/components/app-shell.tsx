import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function AppShell({ children, centered }: PropsWithChildren<{ centered?: boolean }>) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, centered && styles.centeredContent]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.inner}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 16,
  },
  centeredContent: {
    justifyContent: 'center',
  },
  inner: {
    gap: 16,
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
  },
});
