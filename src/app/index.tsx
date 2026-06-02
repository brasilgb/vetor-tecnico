import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { Button, Card, Field, Message, TextMuted } from '@/components/ui-kit';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session-context';

export default function LoginScreen() {
  const { isRestoring, session, signIn } = useSession();
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
    <AppShell centered>
      <View style={styles.brand}>
        <View style={styles.logoCard}>
          <Image source={require('@/assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.brandTitle}>VetorOS Atendimento</Text>
        <TextMuted>Acesse o atendimento interno, clientes e orçamentos.</TextMuted>
      </View>

      <Card>
        <Field
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          leftIcon={<MaterialIcons name="mail" size={21} color="#a8b3c7" />}
        />
        <Field
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          leftIcon={<MaterialIcons name="lock" size={21} color="#a8b3c7" />}
          rightIcon={
            <Pressable
              onPress={() => setShowPassword((current) => !current)}
              style={({ pressed }) => [styles.passwordButton, pressed && styles.pressed]}>
              <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={24} color="#a8b3c7" />
            </Pressable>
          }
        />
        {message ? <Message tone="error">{message}</Message> : null}
        <Button onPress={handleLogin} loading={loading}>
          Entrar
        </Button>
      </Card>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  logoCard: {
    width: 112,
    height: 112,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101a2d',
    borderWidth: 1,
    borderColor: 'rgba(245, 244, 239, 0.12)',
  },
  logo: {
    width: 82,
    height: 82,
  },
  brandTitle: {
    marginTop: 12,
    color: '#f5f4ef',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    textAlign: 'center',
  },
  passwordButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  pressed: {
    opacity: 0.72,
  },
});
