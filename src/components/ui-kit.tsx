import { PropsWithChildren, ReactNode } from 'react';
import { Picker } from '@react-native-picker/picker';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
}

export function Title({ children }: PropsWithChildren) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return <Text style={[styles.title, { color: colors.text }]}>{children}</Text>;
}

export function TextMuted({ children }: PropsWithChildren) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return <Text style={[styles.muted, { color: colors.mutedText }]}>{children}</Text>;
}

export function Field({
  label,
  containerStyle,
  leftIcon,
  rightIcon,
  error,
  ...props
}: TextInputProps & { label: string; containerStyle?: ViewStyle; leftIcon?: ReactNode; rightIcon?: ReactNode; error?: string }) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={[styles.label, { color: colors.mutedText }]}>{label}</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        {leftIcon}
        <TextInput
          placeholderTextColor={colors.mutedText}
          style={[styles.input, { color: colors.text }]}
          {...props}
        />
        {rightIcon}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  containerStyle,
  error,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  containerStyle?: ViewStyle;
  error?: string;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={[styles.label, { color: colors.mutedText }]}>{label}</Text>
      <View style={[styles.selectWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Picker
          selectedValue={value}
          onValueChange={(itemValue) => onChange(String(itemValue))}
          dropdownIconColor={colors.mutedText}
          style={[styles.select, { color: colors.text }]}>
          {options.map((option) => (
            <Picker.Item key={option.value || option.label} label={option.label} value={option.value} />
          ))}
        </Picker>
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function Button({
  children,
  onPress,
  loading,
  variant = 'primary',
}: PropsWithChildren<{ onPress: () => void; loading?: boolean; variant?: 'primary' | 'secondary' }>) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isPrimary ? colors.tint : colors.muted,
          opacity: pressed || loading ? 0.72 : 1,
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#ffffff' : colors.text} />
      ) : (
        <Text style={[styles.buttonText, { color: isPrimary ? '#ffffff' : colors.text }]}>{children}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.tint : colors.muted,
          borderColor: selected ? colors.tint : colors.border,
        },
      ]}>
      <Text style={[styles.chipText, { color: selected ? '#ffffff' : colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Message({ children, tone = 'info' }: PropsWithChildren<{ tone?: 'info' | 'error' }>) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <Text
      style={[
        styles.message,
        {
          color: tone === 'error' ? '#b42318' : colors.accentText,
          backgroundColor: tone === 'error' ? '#fee4e2' : colors.accent,
        },
      ]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  muted: {
    fontSize: 14,
    lineHeight: 20,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  fieldError: {
    color: '#f97066',
    fontSize: 12,
    lineHeight: 16,
  },
  input: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  inputWrap: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectWrap: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  select: {
    width: '100%',
    minHeight: 58,
  },
  button: {
    minHeight: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  buttonText: {
    fontWeight: '700',
    fontSize: 15,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: 220,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    borderRadius: 8,
    overflow: 'hidden',
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
  },
});
