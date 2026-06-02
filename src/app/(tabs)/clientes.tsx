import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { z } from 'zod';

import { AppShell } from '@/components/app-shell';
import { Button, Card, Field, Message, Title } from '@/components/ui-kit';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiError, createCustomer, getCustomers } from '@/lib/api';
import { useSession } from '@/lib/session-context';

const emptyForm = {
  name: '',
  cpfcnpj: '',
  birth: '',
  email: '',
  zipcode: '',
  state: '',
  city: '',
  district: '',
  street: '',
  complement: '',
  number: '',
  phone: '',
  contactname: '',
  whatsapp: '',
  contactphone: '',
  observations: '',
};

const optionalText = (max: number, label: string) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string()
      .max(max, `${label} deve ter no maximo ${max} caracteres.`)
      .optional(),
  );

const requiredText = (max: number, requiredMessage: string, label: string) =>
  z.string().trim().min(1, requiredMessage).max(max, `${label} deve ter no maximo ${max} caracteres.`);

const customerSchema = z.object({
  name: requiredText(255, 'Informe o nome do cliente.', 'Nome'),
  cpfcnpj: requiredText(50, 'Informe o CPF/CNPJ.', 'CPF/CNPJ'),
  birth: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Nascimento deve estar no formato YYYY-MM-DD.')
      .optional(),
  ),
  email: requiredText(50, 'Informe o e-mail.', 'E-mail').email('Informe um e-mail valido.'),
  zipcode: optionalText(20, 'CEP'),
  state: optionalText(20, 'UF'),
  city: optionalText(50, 'Cidade'),
  district: optionalText(50, 'Bairro'),
  street: optionalText(80, 'Rua'),
  complement: optionalText(80, 'Complemento'),
  number: z.preprocess(
    (value) => {
      const text = String(value ?? '').trim();
      return text ? Number(text) : undefined;
    },
    z.number({ error: 'Numero deve ser numerico.' }).int('Numero deve ser inteiro.').positive('Numero deve ser maior que zero.').optional(),
  ),
  phone: requiredText(20, 'Informe o telefone.', 'Telefone'),
  contactname: optionalText(50, 'Nome do contato'),
  whatsapp: requiredText(255, 'Informe o WhatsApp.', 'WhatsApp'),
  contactphone: optionalText(20, 'Telefone do contato'),
  observations: optionalText(500, 'Observacoes'),
});

export default function ClientesScreen() {
  const { width } = useWindowDimensions();
  const colors = Colors[useColorScheme() ?? 'light'];
  const { baseUrl, session } = useSession();
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof emptyForm, string>>>({});
  const [showBirthPicker, setShowBirthPicker] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const token = session?.accessToken;
  const isWide = width >= 700;

  function handleBirthChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS !== 'ios' || event.type === 'dismissed') {
      setShowBirthPicker(false);
    }

    if (!selectedDate || event.type === 'dismissed') return;

    setForm((current) => ({ ...current, birth: formatDateValue(selectedDate) }));
  }

  async function getCep(zipcode: string) {
    const cleanCep = normalizeDocument(zipcode);

    if (!cleanCep) return;

    if (cleanCep.length !== 8) {
      setFieldErrors((current) => ({ ...current, zipcode: 'CEP deve conter 8 digitos.' }));
      return;
    }

    setLoadingCep(true);
    setMessage(null);
    setFieldErrors((current) => ({ ...current, zipcode: undefined }));

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const result = (await response.json()) as {
        erro?: boolean;
        uf?: string;
        localidade?: string;
        bairro?: string;
        logradouro?: string;
        complemento?: string;
      };

      if (result.erro) {
        setFieldErrors((current) => ({ ...current, zipcode: 'CEP nao encontrado.' }));
        return;
      }

      setForm((current) => ({
        ...current,
        state: result.uf ?? current.state,
        city: result.localidade ?? current.city,
        district: result.bairro ?? current.district,
        street: result.logradouro ?? current.street,
        complement: result.complemento ?? current.complement,
      }));
    } catch {
      setFieldErrors((current) => ({ ...current, zipcode: 'Nao foi possivel buscar o CEP.' }));
    } finally {
      setLoadingCep(false);
    }
  }

  async function saveCustomer() {
    if (!token) return;

    setSaving(true);
    setMessage(null);
    setFieldErrors({});

    try {
      const parsedCustomer = customerSchema.safeParse(form);

      if (!parsedCustomer.success) {
        setFieldErrors(mapZodErrors(parsedCustomer.error));
        return;
      }

      const customerPayload = {
        ...parsedCustomer.data,
        cpfcnpj: normalizeDocument(parsedCustomer.data.cpfcnpj),
        zipcode: parsedCustomer.data.zipcode ? normalizeDocument(parsedCustomer.data.zipcode) : undefined,
      };
      const cpfcnpj = normalizeDocument(parsedCustomer.data.cpfcnpj);

      if (cpfcnpj) {
        const customers = await getCustomers(baseUrl, token);
        const existingCustomer = customers.find((customer) => normalizeDocument(customer.cpfcnpj) === cpfcnpj);

        if (existingCustomer) {
          setMessage(`Ja existe um cliente cadastrado com este CPF/CNPJ: ${existingCustomer.name}.`);
          return;
        }
      }

      await createCustomer(baseUrl, token, customerPayload);
      setForm(emptyForm);
      setFieldErrors({});
      setMessage('Pre-cadastro realizado com sucesso.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel salvar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  if (!session) {
    return (
      <AppShell>
        <Message tone="error">Entre no app para acessar clientes.</Message>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Card>
        <Title>Pre-cadastro de cliente</Title>
        <Field label="Nome" value={form.name} onChangeText={(name) => setForm((current) => ({ ...current, name }))} error={fieldErrors.name} />
        <View style={[styles.twoColumns, isWide && styles.twoColumnsWide]}>
          <Field label="CPF/CNPJ" value={form.cpfcnpj} onChangeText={(cpfcnpj) => setForm((current) => ({ ...current, cpfcnpj: maskCpfCnpj(cpfcnpj) }))} keyboardType="number-pad" containerStyle={styles.flexField} error={fieldErrors.cpfcnpj} />
          <View style={[styles.field, styles.flexField]}>
            <Text style={[styles.label, { color: colors.mutedText }]}>Nascimento</Text>
            <Pressable
              onPress={() => setShowBirthPicker(true)}
              style={({ pressed }) => [
                styles.dateButton,
                { backgroundColor: colors.muted, borderColor: colors.border, opacity: pressed ? 0.72 : 1 },
              ]}>
              <Text style={[styles.dateButtonText, { color: form.birth ? colors.text : colors.mutedText }]}>
                {formatDateForDisplay(form.birth) || 'Selecionar data'}
              </Text>
            </Pressable>
            {fieldErrors.birth ? <Text style={styles.fieldError}>{fieldErrors.birth}</Text> : null}
          </View>
        </View>
        {showBirthPicker ? (
          <DateTimePicker
            value={parseDateValue(form.birth)}
            mode="date"
            display="spinner"
            maximumDate={new Date()}
            onChange={handleBirthChange}
          />
        ) : null}
        <Field label="E-mail" value={form.email} onChangeText={(email) => setForm((current) => ({ ...current, email }))} keyboardType="email-address" autoCapitalize="none" error={fieldErrors.email} />

        <View style={[styles.twoColumns, isWide && styles.twoColumnsWide]}>
          <Field label="CEP" value={form.zipcode} onChangeText={(zipcode) => setForm((current) => ({ ...current, zipcode: maskCep(zipcode) }))} onBlur={() => getCep(form.zipcode)} keyboardType="number-pad" containerStyle={styles.flexField} error={fieldErrors.zipcode} placeholder={loadingCep ? 'Buscando CEP...' : undefined} />
          <Field label="UF" value={form.state} onChangeText={(state) => setForm((current) => ({ ...current, state }))} autoCapitalize="characters" maxLength={2} containerStyle={styles.flexField} error={fieldErrors.state} />
        </View>
        <View style={[styles.twoColumns, isWide && styles.twoColumnsWide]}>
          <Field label="Cidade" value={form.city} onChangeText={(city) => setForm((current) => ({ ...current, city }))} containerStyle={styles.flexField} error={fieldErrors.city} />
          <Field label="Bairro" value={form.district} onChangeText={(district) => setForm((current) => ({ ...current, district }))} containerStyle={styles.flexField} error={fieldErrors.district} />
        </View>
        <Field label="Rua" value={form.street} onChangeText={(street) => setForm((current) => ({ ...current, street }))} error={fieldErrors.street} />
        <View style={[styles.twoColumns, isWide && styles.twoColumnsWide]}>
          <Field label="Número" value={form.number} onChangeText={(number) => setForm((current) => ({ ...current, number }))} keyboardType="number-pad" containerStyle={styles.flexField} error={fieldErrors.number} />
          <Field label="Complemento" value={form.complement} onChangeText={(complement) => setForm((current) => ({ ...current, complement }))} containerStyle={styles.flexField} error={fieldErrors.complement} />
        </View>

        <View style={[styles.twoColumns, isWide && styles.twoColumnsWide]}>
          <Field label="Telefone" value={form.phone} onChangeText={(phone) => setForm((current) => ({ ...current, phone }))} keyboardType="phone-pad" containerStyle={styles.flexField} error={fieldErrors.phone} />
          <Field label="WhatsApp" value={form.whatsapp} onChangeText={(whatsapp) => setForm((current) => ({ ...current, whatsapp }))} keyboardType="phone-pad" containerStyle={styles.flexField} error={fieldErrors.whatsapp} />
        </View>
        <View style={[styles.twoColumns, isWide && styles.twoColumnsWide]}>
          <Field label="Nome do contato" value={form.contactname} onChangeText={(contactname) => setForm((current) => ({ ...current, contactname }))} containerStyle={styles.flexField} error={fieldErrors.contactname} />
          <Field label="Telefone do contato" value={form.contactphone} onChangeText={(contactphone) => setForm((current) => ({ ...current, contactphone }))} keyboardType="phone-pad" containerStyle={styles.flexField} error={fieldErrors.contactphone} />
        </View>
        <Field label="Observacoes" value={form.observations} onChangeText={(observations) => setForm((current) => ({ ...current, observations }))} multiline error={fieldErrors.observations} />
        {message ? <Message tone={message.includes('sucesso') ? 'info' : 'error'}>{message}</Message> : null}
        <Button onPress={saveCustomer} loading={saving}>
          Salvar cliente
        </Button>
      </Card>
    </AppShell>
  );
}

function normalizeDocument(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

function maskCpfCnpj(value: string) {
  const digits = normalizeDocument(value).slice(0, 14);

  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

function maskCep(value: string) {
  return normalizeDocument(value)
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, '$1-$2');
}

function emptyToUndefined(value: unknown) {
  if (typeof value !== 'string') return value;

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function mapZodErrors(error: z.ZodError) {
  const errors: Partial<Record<keyof typeof emptyForm, string>> = {};

  for (const issue of error.issues) {
    const field = issue.path[0] as keyof typeof emptyForm | undefined;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }

  return errors;
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function parseDateValue(value: string) {
  if (!value) return new Date();

  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) return new Date();

  return new Date(year, month - 1, day);
}

function formatDateForDisplay(value: string) {
  if (!value) return '';

  const [year, month, day] = value.split('-');

  if (!year || !month || !day) return value;

  return `${day}/${month}/${year}`;
}

const styles = StyleSheet.create({
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
  dateButton: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dateButtonText: {
    fontSize: 16,
  },
  twoColumns: {
    gap: 10,
  },
  twoColumnsWide: {
    flexDirection: 'row',
  },
  flexField: {
    flex: 1,
  },
});
