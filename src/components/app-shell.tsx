import { PropsWithChildren, RefObject } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function AppShell({
  children,
  centered,
  topSafeArea,
  scrollRef,
}: PropsWithChildren<{ centered?: boolean; topSafeArea?: boolean; scrollRef?: RefObject<ScrollView | null> }>) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const edges: Edge[] = topSafeArea ? ['top', 'bottom'] : ['bottom'];

  return (
    <SafeAreaView edges={edges} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, centered && styles.centeredContent]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
  },
  centeredContent: {
    justifyContent: 'center',
  },
  inner: {
    gap: 18,
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
  },
});
