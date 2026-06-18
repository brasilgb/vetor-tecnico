<<<<<<< HEAD
import { PropsWithChildren, RefObject } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';
=======
import { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
>>>>>>> 2b7653d (Push)

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

<<<<<<< HEAD
export function AppShell({
  children,
  centered,
  topSafeArea,
  scrollRef,
}: PropsWithChildren<{ centered?: boolean; topSafeArea?: boolean; scrollRef?: RefObject<ScrollView | null> }>) {
=======
export function AppShell({ children, centered, avoidKeyboard }: PropsWithChildren<{ centered?: boolean; avoidKeyboard?: boolean }>) {
>>>>>>> 2b7653d (Push)
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const edges: Edge[] = topSafeArea ? ['top', 'bottom'] : ['bottom'];

<<<<<<< HEAD
  return (
    <SafeAreaView edges={edges} style={[styles.container, { backgroundColor: colors.background }]}>
=======
  const content = (
    <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: colors.background }]}>
>>>>>>> 2b7653d (Push)
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, centered && styles.centeredContent]}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );

  if (!avoidKeyboard || Platform.OS !== 'ios') {
    return content;
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior="padding">
      {content}
    </KeyboardAvoidingView>
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
