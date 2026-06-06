import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { Button, Card, Field, Message, TextMuted } from '@/components/ui-kit';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session-context';

export default function LoginScreen() {
  const { isRestoring, session, signIn } = useSession();
  const colors = Colors[useColorScheme() ?? 'light'];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isRestoring && session) {
      router.replace('/home');
    }
  }, [isRestoring, session]);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setMessage('Informe e-mail e senha.');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await signIn(email.trim(), password);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'E-mail e/ou senha invalidos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
      <AppShell centered>
        <View style={styles.loginLayout}>
          <View style={styles.brandPanel}>
            <View style={styles.logoCard}>
              <Image source={require('@/assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
            </View>
            <Text style={styles.brandKicker}>Operação técnica</Text>
            <Text style={styles.brandTitle}>VetorOS Técnico</Text>
            <Text style={styles.brandText}>Agenda, dados da OS e registros de execução reunidos em uma área de trabalho objetiva.</Text>
          </View>

          <Card style={styles.loginCard}>
            <View>
              <Text style={[styles.formTitle, { color: colors.text }]}>Acesso do técnico</Text>
              <TextMuted>Informe suas credenciais para abrir sua agenda.</TextMuted>
            </View>
            <Field
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              leftIcon={<MaterialIcons name="mail" size={21} color="#637083" />}
            />
            <Field
              label="Senha"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              leftIcon={<MaterialIcons name="lock" size={21} color="#637083" />}
              rightIcon={
                <Pressable
                  onPress={() => setShowPassword((current) => !current)}
                  style={({ pressed }) => [styles.passwordButton, pressed && styles.pressed]}>
                  <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={24} color="#637083" />
                </Pressable>
              }
            />
            {message ? <Message tone="error">{message}</Message> : null}
            <Button onPress={handleLogin} loading={loading}>
              Entrar
            </Button>
          </Card>
        </View>
      </AppShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  loginLayout: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 18,
  },
  brandPanel: {
    flexGrow: 1,
    flexBasis: 320,
    borderRadius: 8,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#15365f',
  },
  logoCard: {
    width: 84,
    height: 84,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  logo: {
    width: 62,
    height: 62,
  },
  brandKicker: {
    marginTop: 22,
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  brandTitle: {
    marginTop: 4,
    color: '#ffffff',
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '900',
  },
  brandText: {
    marginTop: 12,
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  loginCard: {
    flexGrow: 1,
    flexBasis: 340,
    justifyContent: 'center',
  },
  formTitle: {
    color: '#172033',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  passwordButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.72,
  },
});
