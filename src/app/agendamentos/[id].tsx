import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { Button, Card, Message, TextMuted, Title } from '@/components/ui-kit';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  ApiError,
  checkInTechnicianSchedule,
  checkOutTechnicianSchedule,
  deleteOrderImage,
  getOrderImages,
  getTechnicianSchedule,
  OrderImage,
  recordTechnicianSchedulePayment,
  TechnicianSchedule,
  uploadOrderImage,
  updateTechnicianScheduleReport,
} from '@/lib/api';
import { useSession } from '@/lib/session-context';

type ActionKind = 'check-in' | 'check-out';
type PaymentMethod = 'pix' | 'cartao' | 'dinheiro' | 'transferencia';

const paymentMethods: { label: string; value: PaymentMethod; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { label: 'Pix', value: 'pix', icon: 'qr-code-2' },
  { label: 'Cartao', value: 'cartao', icon: 'credit-card' },
  { label: 'Dinheiro', value: 'dinheiro', icon: 'payments' },
  { label: 'Transferencia', value: 'transferencia', icon: 'account-balance' },
];

export default function ScheduleDetailScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { baseUrl, session } = useSession();
  const [schedule, setSchedule] = useState<TechnicianSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<ActionKind | null>(null);
  const [images, setImages] = useState<OrderImage[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [reportForm, setReportForm] = useState({
    diagnosis: '',
    solution: '',
    observations: '',
  });
  const [paymentForm, setPaymentForm] = useState<{
    amount: string;
    method: PaymentMethod;
    notes: string;
  }>({
    amount: '',
    method: 'pix',
    notes: '',
  });
  const [observations, setObservations] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const token = session?.accessToken;
  const scheduleId = Number(params.id);

  const loadSchedule = useCallback(async () => {
    if (!token || !Number.isFinite(scheduleId)) return;

    setLoading(true);
    setMessage(null);

    try {
      const scheduleResponse = await getTechnicianSchedule(baseUrl, token, scheduleId);
      setSchedule(scheduleResponse);
      setReportForm({
        diagnosis: scheduleResponse.order?.technician_diagnosis ?? '',
        solution: scheduleResponse.order?.technician_solution ?? '',
        observations: scheduleResponse.order?.technician_observations ?? '',
      });

      if (scheduleResponse.order?.order_number) {
        setImages(await getOrderImages(baseUrl, token, scheduleResponse.order.order_number));
      } else {
        setImages([]);
      }
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel carregar o atendimento.');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, scheduleId, token]);

  useFocusEffect(
    useCallback(() => {
      loadSchedule();
    }, [loadSchedule]),
  );

  const address = useMemo(() => formatAddress(schedule), [schedule]);
  const mapsUrl = useMemo(() => getMapsUrl(address), [address]);
  const canCheckIn = Boolean(schedule && schedule.status !== 3 && !schedule.check_in?.at);
  const canCheckOut = Boolean(schedule && schedule.status !== 3 && schedule.check_in?.at && !schedule.check_out?.at);
  const paymentSummary = getPaymentSummary(schedule);

  async function handleAttendanceAction(kind: ActionKind) {
    if (!token || !schedule) return;

    setActionLoading(kind);
    setMessage(null);

    try {
      const coordinates = await getCurrentCoordinates();
      const payload = {
        ...coordinates,
        ...(observations.trim() ? { observations: observations.trim() } : {}),
      };
      const updated =
        kind === 'check-in'
          ? await checkInTechnicianSchedule(baseUrl, token, schedule.id, payload)
          : await checkOutTechnicianSchedule(baseUrl, token, schedule.id, payload);

      setSchedule(updated);
      setObservations('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel registrar a acao.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveReport() {
    if (!token || !schedule) return;

    setReportLoading(true);
    setMessage(null);

    try {
      const updated = await updateTechnicianScheduleReport(baseUrl, token, schedule.id, {
        technician_diagnosis: normalizeText(reportForm.diagnosis),
        technician_solution: normalizeText(reportForm.solution),
        technician_observations: normalizeText(reportForm.observations),
      });

      setSchedule(updated);
      setReportForm({
        diagnosis: updated.order?.technician_diagnosis ?? '',
        solution: updated.order?.technician_solution ?? '',
        observations: updated.order?.technician_observations ?? '',
      });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel salvar o relatorio tecnico.');
    } finally {
      setReportLoading(false);
    }
  }

  async function handleRecordPayment() {
    if (!token || !schedule) return;

    const amount = parseMoneyInput(paymentForm.amount);

    if (!amount || amount <= 0) {
      setMessage('Informe um valor de pagamento valido.');
      return;
    }

    setPaymentLoading(true);
    setMessage(null);

    try {
      const updated = await recordTechnicianSchedulePayment(baseUrl, token, schedule.id, {
        amount,
        payment_method: paymentForm.method,
        notes: normalizeText(paymentForm.notes),
      });

      setSchedule(updated);
      setPaymentForm({ amount: '', method: 'pix', notes: '' });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel registrar o pagamento.');
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handlePickImage(source: 'camera' | 'library') {
    if (!token || !schedule?.order?.order_number) return;

    setImageLoading(true);
    setMessage(null);

    try {
      const result = source === 'camera' ? await launchCamera() : await launchLibrary();

      if (result.canceled || !result.assets[0]?.base64) return;

      await uploadOrderImage(baseUrl, token, schedule.order.order_number, result.assets[0].base64);
      setImages(await getOrderImages(baseUrl, token, schedule.order.order_number));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel anexar a imagem.');
    } finally {
      setImageLoading(false);
    }
  }

  async function handleDeleteImage(image: OrderImage) {
    if (!token || !schedule?.order?.order_number) return;

    setImageLoading(true);
    setMessage(null);

    try {
      await deleteOrderImage(baseUrl, token, image.id);
      setImages((current) => current.filter((item) => item.id !== image.id));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel remover a imagem.');
    } finally {
      setImageLoading(false);
    }
  }

  if (!session) {
    return (
      <AppShell>
        <TextMuted>Entre no app para acessar o atendimento.</TextMuted>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <View style={[styles.pageHeader, { backgroundColor: colors.accent }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
          <MaterialIcons name="arrow-back" size={22} color="#ffffff" />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEyebrow}>Atendimento tecnico</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {schedule ? `Agenda #${schedule.schedules_number}` : 'Carregando agenda'}
          </Text>
          <Text style={styles.headerDetail}>{schedule ? formatDateTime(schedule.schedules) : 'Sincronizando dados do atendimento'}</Text>
        </View>
        <Pressable
          disabled={loading}
          onPress={loadSchedule}
          style={({ pressed }) => [styles.headerIconButton, { opacity: loading ? 0.58 : pressed ? 0.72 : 1 }]}>
          <MaterialIcons name="refresh" size={22} color="#ffffff" />
        </Pressable>
      </View>

      {message ? <Message tone="error">{message}</Message> : null}

      {schedule ? (
        <>
          <Card>
            <View style={styles.titleRow}>
              <View style={styles.titleText}>
                <Text style={[styles.kicker, { color: colors.mutedText }]}>Cliente</Text>
                <Title>{schedule.customer?.name ?? 'Cliente nao informado'}</Title>
              </View>
              <StatusPill label={schedule.technician_status_label ?? schedule.status_label ?? 'Agendado'} status={schedule.status} />
            </View>

            <View style={styles.infoGrid}>
              <InfoRow icon="build" label="Servico" value={schedule.service ?? schedule.details ?? 'Servico nao informado'} />
              <InfoRow icon="place" label="Endereco" value={address ?? 'Endereco nao informado'} />
              <InfoRow icon="phone" label="Telefone" value={schedule.customer?.phone ?? 'Nao informado'} />
              <InfoRow icon="chat" label="WhatsApp" value={schedule.customer?.whatsapp ?? 'Nao informado'} />
            </View>

            <View style={styles.quickActions}>
              {mapsUrl ? <IconAction icon="route" label="Rota" onPress={() => Linking.openURL(mapsUrl)} /> : null}
              {schedule.customer?.phone ? <IconAction icon="call" label="Ligar" onPress={() => Linking.openURL(`tel:${schedule.customer?.phone ?? ''}`)} /> : null}
              {schedule.customer?.whatsapp ? <IconAction icon="chat" label="Whats" onPress={() => openWhatsApp(schedule.customer?.whatsapp ?? '')} /> : null}
            </View>
          </Card>

          <Card>
            <PanelHeader title="Execucao do atendimento" detail={nextActionText(canCheckIn, canCheckOut)} />
            <View style={[styles.actionSummary, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <View style={[styles.actionSummaryIcon, { backgroundColor: canCheckOut ? colors.success : colors.tint }]}>
                <MaterialIcons name={canCheckOut ? 'flag' : canCheckIn ? 'my-location' : 'task-alt'} size={20} color="#ffffff" />
              </View>
              <View style={styles.actionSummaryText}>
                <Text style={[styles.actionSummaryLabel, { color: colors.mutedText }]}>Proxima etapa</Text>
                <Text style={[styles.actionSummaryValue, { color: colors.text }]}>{nextActionTitle(canCheckIn, canCheckOut)}</Text>
              </View>
            </View>
            <View style={styles.timeline}>
              <TimelineItem label="Check-in" value={formatOptionalDateTime(schedule.check_in?.at)} done={Boolean(schedule.check_in?.at)} />
              <TimelineItem label="GPS check-in" value={formatCoordinates(schedule.check_in?.latitude, schedule.check_in?.longitude)} done={Boolean(schedule.check_in?.latitude && schedule.check_in?.longitude)} />
              <TimelineItem label="Check-out" value={formatOptionalDateTime(schedule.check_out?.at)} done={Boolean(schedule.check_out?.at)} />
              <TimelineItem label="GPS check-out" value={formatCoordinates(schedule.check_out?.latitude, schedule.check_out?.longitude)} done={Boolean(schedule.check_out?.latitude && schedule.check_out?.longitude)} />
            </View>
            <TextInput
              multiline
              value={observations}
              onChangeText={setObservations}
              placeholder="Observacoes do atendimento"
              placeholderTextColor={colors.mutedText}
              style={[styles.notesInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
            />
            <View style={styles.actions}>
              {canCheckIn ? (
                <Button onPress={() => handleAttendanceAction('check-in')} loading={actionLoading === 'check-in'}>
                  Registrar check-in
                </Button>
              ) : null}
              {canCheckOut ? (
                <Button onPress={() => handleAttendanceAction('check-out')} loading={actionLoading === 'check-out'}>
                  Registrar check-out
                </Button>
              ) : null}
              {!canCheckIn && !canCheckOut ? <TextMuted>Nenhuma acao pendente para este atendimento.</TextMuted> : null}
            </View>
          </Card>

          {schedule.order ? (
            <Card>
              <PanelHeader title="Ordem de servico" detail="Dados tecnicos vinculados ao atendimento" />
              <View style={styles.infoGrid}>
                <InfoRow icon="confirmation-number" label="OS" value={String(schedule.order.order_number)} />
                <InfoRow icon="precision-manufacturing" label="Equipamento" value={schedule.order.equipment?.equipment ?? 'Nao informado'} />
                <InfoRow icon="devices" label="Modelo" value={schedule.order.model ?? 'Nao informado'} />
                <InfoRow icon="report-problem" label="Defeito" value={schedule.order.defect ?? 'Nao informado'} />
                <InfoRow icon="fact-check" label="Estado" value={schedule.order.state_conservation ?? 'Nao informado'} />
                <InfoRow icon="inventory-2" label="Acessorios" value={schedule.order.accessories ?? 'Nao informado'} />
                <InfoRow icon="notes" label="Observacoes" value={schedule.order.observations ?? 'Nao informado'} wide />
              </View>
            </Card>
          ) : null}

          {schedule.order ? (
            <Card>
              <PanelHeader title="Relatorio tecnico" detail={schedule.order.technician_attended_at ? `Atualizado em ${formatDateTime(schedule.order.technician_attended_at)}` : 'Diagnostico e solucao do atendimento'} />
              <TextInput
                multiline
                value={reportForm.diagnosis}
                onChangeText={(value) => setReportForm((current) => ({ ...current, diagnosis: value }))}
                placeholder="Diagnostico encontrado"
                placeholderTextColor={colors.mutedText}
                style={[styles.notesInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
              />
              <TextInput
                multiline
                value={reportForm.solution}
                onChangeText={(value) => setReportForm((current) => ({ ...current, solution: value }))}
                placeholder="Solucao aplicada"
                placeholderTextColor={colors.mutedText}
                style={[styles.notesInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
              />
              <TextInput
                multiline
                value={reportForm.observations}
                onChangeText={(value) => setReportForm((current) => ({ ...current, observations: value }))}
                placeholder="Observacoes finais"
                placeholderTextColor={colors.mutedText}
                style={[styles.notesInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
              />
              <Button onPress={handleSaveReport} loading={reportLoading}>
                Salvar relatorio
              </Button>
            </Card>
          ) : null}

          {schedule.order ? (
            <Card>
              <PanelHeader title="Pagamento local" detail={`Saldo: ${formatMoney(paymentSummary.remaining)} de ${formatMoney(paymentSummary.total)}`} />
              <View style={styles.paymentSummaryGrid}>
                <PaymentMetric label="Total da OS" value={formatMoney(paymentSummary.total)} />
                <PaymentMetric label="Pago" value={formatMoney(paymentSummary.paid)} />
                <PaymentMetric label="Saldo" value={formatMoney(paymentSummary.remaining)} />
              </View>
              {schedule.order.technician_local_payment_received ? (
                <DataNote
                  icon="verified"
                  title="Pagamento registrado pelo tecnico"
                  detail={`${formatMoney(Number(schedule.order.technician_local_payment_amount ?? 0))} - ${paymentMethodLabel(schedule.order.technician_local_payment_method)}`}
                />
              ) : null}
              <View style={styles.paymentMethods}>
                {paymentMethods.map((method) => (
                  <Pressable
                    key={method.value}
                    onPress={() => setPaymentForm((current) => ({ ...current, method: method.value }))}
                    style={({ pressed }) => [
                      styles.paymentMethodButton,
                      {
                        backgroundColor: paymentForm.method === method.value ? colors.accent : colors.muted,
                        borderColor: paymentForm.method === method.value ? colors.accent : colors.border,
                        opacity: pressed ? 0.72 : 1,
                      },
                    ]}>
                    <MaterialIcons name={method.icon} size={17} color={paymentForm.method === method.value ? '#ffffff' : colors.text} />
                    <Text style={[styles.paymentMethodText, { color: paymentForm.method === method.value ? '#ffffff' : colors.text }]}>{method.label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={paymentForm.amount}
                onChangeText={(value) => setPaymentForm((current) => ({ ...current, amount: value }))}
                placeholder="Valor recebido"
                placeholderTextColor={colors.mutedText}
                keyboardType="decimal-pad"
                style={[styles.paymentInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
              />
              <TextInput
                multiline
                value={paymentForm.notes}
                onChangeText={(value) => setPaymentForm((current) => ({ ...current, notes: value }))}
                placeholder="Observacao do pagamento"
                placeholderTextColor={colors.mutedText}
                style={[styles.notesInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
              />
              <Button onPress={handleRecordPayment} loading={paymentLoading}>
                Registrar pagamento
              </Button>
            </Card>
          ) : null}

          {schedule.order ? (
            <Card>
              <PanelHeader title="Imagens do atendimento" detail={`${images.length}/4 imagens anexadas`} />
              <View style={styles.quickActions}>
                <IconAction icon="photo-camera" label={imageLoading ? 'Enviando' : 'Camera'} onPress={() => handlePickImage('camera')} disabled={imageLoading || images.length >= 4} />
                <IconAction icon="photo-library" label="Galeria" onPress={() => handlePickImage('library')} disabled={imageLoading || images.length >= 4} />
              </View>
              {images.length > 0 ? (
                <View style={styles.imageGrid}>
                  {images.map((image) => (
                    <View key={image.id} style={[styles.imageTile, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                      <Image source={{ uri: getOrderImageUrl(baseUrl, schedule.order?.order_number, image.filename) }} style={styles.orderImage} resizeMode="cover" />
                      <Pressable
                        disabled={imageLoading}
                        onPress={() => handleDeleteImage(image)}
                        style={({ pressed }) => [styles.deleteImageButton, pressed && styles.pressed]}>
                        <MaterialIcons name="delete" size={18} color="#ffffff" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <TextMuted>Nenhuma imagem anexada.</TextMuted>
              )}
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <TextMuted>{loading ? 'Carregando atendimento...' : 'Atendimento nao encontrado.'}</TextMuted>
        </Card>
      )}
    </AppShell>
  );
}

function PanelHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <View>
      <Title>{title}</Title>
      <TextMuted>{detail}</TextMuted>
    </View>
  );
}

function nextActionText(canCheckIn: boolean, canCheckOut: boolean) {
  if (canCheckIn) return 'Proxima acao: registrar chegada ao cliente.';
  if (canCheckOut) return 'Proxima acao: finalizar atendimento no local.';

  return 'Atendimento sem acao pendente.';
}

function nextActionTitle(canCheckIn: boolean, canCheckOut: boolean) {
  if (canCheckIn) return 'Registrar chegada ao cliente';
  if (canCheckOut) return 'Finalizar atendimento no local';

  return 'Atendimento sem pendencias';
}

function StatusPill({ label, status }: { label: string; status: number }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const tint = status === 3 ? colors.success : status === 2 ? colors.tint : '#a05a00';

  return (
    <View style={[styles.statusPill, { backgroundColor: `${tint}16`, borderColor: `${tint}44` }]}>
      <View style={[styles.statusDot, { backgroundColor: tint }]} />
      <Text style={[styles.statusText, { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  wide,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  wide?: boolean;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={[styles.infoRow, wide && styles.infoRowWide]}>
      <MaterialIcons name={icon} size={19} color={colors.icon} />
      <View style={styles.infoText}>
        <Text style={[styles.infoLabel, { color: colors.mutedText }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function PaymentMetric({ label, value }: { label: string; value: string }) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={[styles.paymentMetric, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.mutedText }]}>{label}</Text>
      <Text style={[styles.paymentMetricValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function DataNote({
  icon,
  title,
  detail,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  detail: string;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={[styles.dataNote, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <MaterialIcons name={icon} size={20} color={colors.success} />
      <View style={styles.infoText}>
        <Text style={[styles.infoLabel, { color: colors.mutedText }]}>{title}</Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>{detail}</Text>
      </View>
    </View>
  );
}

function IconAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        { borderColor: colors.border, backgroundColor: colors.muted, opacity: disabled ? 0.58 : pressed ? 0.72 : 1 },
      ]}>
      <MaterialIcons name={icon} size={18} color={colors.text} />
      <Text style={[styles.iconActionText, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function TimelineItem({ label, value, done }: { label: string; value: string; done: boolean }) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={[styles.timelineItem, { borderColor: colors.border }]}>
      <View style={[styles.timelineIcon, { backgroundColor: done ? colors.success : colors.muted }]}>
        <MaterialIcons name={done ? 'check' : 'schedule'} size={17} color={done ? '#ffffff' : colors.icon} />
      </View>
      <View style={styles.timelineText}>
        <Text style={[styles.infoLabel, { color: colors.mutedText }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function formatAddress(schedule: TechnicianSchedule | null) {
  const address = schedule?.customer?.address;

  if (!address) return null;

  return [address.street, address.number, address.district, address.city, address.state]
    .filter((item) => item !== undefined && item !== null && String(item).trim().length > 0)
    .join(', ');
}

function getMapsUrl(address: string | null) {
  if (!address) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function openWhatsApp(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.length > 11 ? digits : `55${digits}`;

  Linking.openURL(`https://wa.me/${normalized}`);
}

async function getCurrentCoordinates() {
  const permission = await Location.requestForegroundPermissionsAsync();

  if (permission.status !== Location.PermissionStatus.GRANTED) {
    throw new ApiError('Permita o acesso a localizacao para registrar a acao.', 422);
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

async function launchCamera() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();

  if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
    throw new ApiError('Permita o acesso a camera para anexar imagens.', 422);
  }

  return ImagePicker.launchCameraAsync({
    allowsEditing: false,
    base64: true,
    quality: 0.72,
  });
}

async function launchLibrary() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
    throw new ApiError('Permita o acesso a galeria para anexar imagens.', 422);
  }

  return ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    base64: true,
    mediaTypes: ['images'],
    quality: 0.72,
  });
}

function getOrderImageUrl(baseUrl: string, orderNumber: number | null | undefined, filename: string) {
  const serverUrl = baseUrl.replace(/\/api\/?$/, '');

  return `${serverUrl}/storage/orders/${orderNumber ?? ''}/${filename}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatOptionalDateTime(value: string | null | undefined) {
  if (!value) return 'Pendente';

  return formatDateTime(value);
}

function formatCoordinates(latitude: string | number | null | undefined, longitude: string | number | null | undefined) {
  if (!latitude || !longitude) return 'Nao registrado';

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (Number.isNaN(lat) || Number.isNaN(lng)) return `${latitude}, ${longitude}`;

  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function getPaymentSummary(schedule: TechnicianSchedule | null) {
  const total = Number(schedule?.order?.service_cost ?? 0);
  const paid = (schedule?.order?.order_payments ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

  return {
    total,
    paid,
    remaining: Math.max(0, total - paid),
  };
}

function parseMoneyInput(value: string) {
  const normalized = value.includes(',')
    ? value.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
    : value.replace(/[^\d.]/g, '');
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function paymentMethodLabel(value: string | null | undefined) {
  return paymentMethods.find((method) => method.value === value)?.label ?? 'Nao informado';
}

function normalizeText(value: string) {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

const styles = StyleSheet.create({
  pageHeader: {
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerEyebrow: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
  },
  headerDetail: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statusPill: {
    maxWidth: 150,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoRow: {
    flexGrow: 1,
    flexBasis: 220,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  infoRowWide: {
    flexBasis: '100%',
  },
  infoText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  infoLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  quickActions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 10,
  },
  iconAction: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  iconActionText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '900',
  },
  timeline: {
    gap: 10,
  },
  actionSummary: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionSummaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSummaryText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  actionSummaryLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  actionSummaryValue: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  timelineItem: {
    minHeight: 62,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineText: {
    flex: 1,
    minWidth: 0,
  },
  notesInput: {
    minHeight: 112,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  actions: {
    gap: 10,
  },
  paymentSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  paymentMetric: {
    flexGrow: 1,
    flexBasis: 150,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  paymentMetricValue: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '900',
  },
  dataNote: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentMethods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentMethodButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentMethodText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  paymentInput: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  imageTile: {
    width: 112,
    height: 112,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  orderImage: {
    width: '100%',
    height: '100%',
  },
  deleteImageButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 36, 0.74)',
  },
  pressed: {
    opacity: 0.72,
  },
});
