import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppShell } from '@/components/app-shell';
import { Field } from '@/components/ui-kit';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session-context';

const SAVED_EMAIL_KEY = '@VetorTecnico:email';
const SAVED_PASSWORD_KEY = '@VetorTecnico:password';

export default function LoginScreen() {
  const { width } = useWindowDimensions();
  const { isRestoring, session, signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isWide = width >= 768;

  useEffect(() => {
    async function loadCredentials() {
      try {
        const [savedEmail, savedPassword] = await Promise.all([
          SecureStore.getItemAsync(SAVED_EMAIL_KEY),
          SecureStore.getItemAsync(SAVED_PASSWORD_KEY),
        ]);

        if (savedEmail && savedPassword) {
          setEmail(savedEmail);
          setPassword(savedPassword);
          setRememberPassword(true);
        }
      } catch {
        // O login continua disponível caso o armazenamento seguro falhe.
      }
    }

    loadCredentials();
  }, []);

  useEffect(() => {
    if (!isRestoring && session) {
      router.replace('/home');
    }
  }, [isRestoring, session]);

  async function handleLogin() {
    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setMessage('Informe e-mail e senha.');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await signIn(normalizedEmail, password);

      try {
        if (rememberPassword) {
          await Promise.all([
            SecureStore.setItemAsync(SAVED_EMAIL_KEY, normalizedEmail),
            SecureStore.setItemAsync(SAVED_PASSWORD_KEY, password),
          ]);
        } else {
          await Promise.all([
            SecureStore.deleteItemAsync(SAVED_EMAIL_KEY),
            SecureStore.deleteItemAsync(SAVED_PASSWORD_KEY),
          ]);
        }
      } catch {
        // A autenticação concluída não depende da persistência local.
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'E-mail e/ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  }

  if (isRestoring) {
    return (
      <View style={styles.restoring}>
        <ActivityIndicator color="#00b4ff" size="large" />
        <Text style={styles.restoringText}>Preparando sua área técnica...</Text>
      </View>
    );
  }

  return (
    <AppShell centered avoidKeyboard>
      <View style={[styles.loginLayout, isWide && styles.loginLayoutWide]}>
        <View style={[styles.brandPanel, isWide && styles.panelWide]}>
          <View style={styles.logoCard}>
            <Image source={require('@/assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          </View>
          <Text style={styles.brandKicker}>Operação técnica</Text>
          <Text style={styles.brandTitle}>VetorOS Técnico</Text>
          <Text style={styles.brandText}>Agenda, dados da OS e registros de execução reunidos em uma área de trabalho objetiva.</Text>
        </View>

        <View style={[styles.loginCard, isWide && styles.panelWide]}>
          <View>
            <Text style={styles.formTitle}>Acesso do técnico</Text>
            <Text style={styles.formDescription}>Informe suas credenciais para abrir sua agenda.</Text>
          </View>
          <Field
            label="E-mail"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (message) setMessage(null);
            }}
            placeholder="E-mail"
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            leftIcon={<MaterialIcons name="mail" size={21} color="#a8b3c7" />}
          />
          <Field
            label="Senha"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              if (message) setMessage(null);
            }}
            placeholder="Senha"
            secureTextEntry={!showPassword}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            leftIcon={<MaterialIcons name="lock" size={21} color="#a8b3c7" />}
            rightIcon={
              <Pressable
                accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onPress={() => setShowPassword((current) => !current)}
                style={({ pressed }) => [styles.passwordButton, pressed && styles.pressed]}>
                <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={24} color="#a8b3c7" />
              </Pressable>
            }
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberPassword }}
            onPress={() => setRememberPassword((current) => !current)}
            style={({ pressed }) => [styles.rememberRow, pressed && styles.pressed]}>
            <View style={[styles.checkbox, rememberPassword && styles.checkboxChecked]}>
              {rememberPassword ? <MaterialIcons name="check" size={16} color="#ffffff" /> : null}
            </View>
            <Text style={styles.rememberText}>Lembrar senha</Text>
          </Pressable>

          {message ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <MaterialIcons name="error-outline" size={19} color="#f97066" />
              <Text style={styles.errorText}>{message}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={handleLogin}
            style={({ pressed }) => [styles.loginButton, (pressed || loading) && styles.buttonDisabled]}>
            {loading ? (
              <ActivityIndicator color="#0b1220" />
            ) : (
              <>
                <Text style={styles.loginButtonText}>Entrar</Text>
                <MaterialIcons name="arrow-forward" size={20} color="#0b1220" />
              </>
            )}
          </Pressable>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  restoring: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#0b1220',
  },
  restoringText: {
    color: '#a8b3c7',
    fontSize: 14,
    fontWeight: '600',
  },
  loginLayout: {
    width: '100%',
    gap: 18,
  },
  loginLayoutWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  panelWide: {
    flex: 1,
  },
  brandPanel: {
    borderRadius: 16,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#15365f',
  },
  logoCard: {
    width: 84,
    height: 84,
    borderRadius: 16,
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
    width: '100%',
    justifyContent: 'center',
    gap: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 244, 239, 0.12)',
    backgroundColor: '#101a2d',
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 5,
  },
  formTitle: {
    color: '#f5f4ef',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  formDescription: {
    marginTop: 4,
    color: '#a8b3c7',
    fontSize: 14,
    lineHeight: 20,
  },
  passwordButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  rememberRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 244, 239, 0.18)',
  },
  checkboxChecked: {
    borderColor: '#00b4ff',
    backgroundColor: '#00b4ff',
  },
  rememberText: {
    color: '#f5f4ef',
    fontSize: 14,
  },
  errorBox: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(249, 112, 102, 0.35)',
    backgroundColor: 'rgba(249, 112, 102, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    color: '#f97066',
    fontSize: 14,
    lineHeight: 20,
  },
  loginButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#00b4ff',
  },
  loginButtonText: {
    color: '#0b1220',
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
