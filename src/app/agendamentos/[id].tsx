import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { Button, Card, Message, TextMuted, Title } from '@/components/ui-kit';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  updateTechnicianScheduleChecklist,
  updateTechnicianScheduleReport,
} from '@/lib/api';
import { useSession } from '@/lib/session-context';

type ActionKind = 'check-in' | 'check-out';
type PaymentMethod = 'pix' | 'cartao' | 'dinheiro' | 'transferencia';
type DetailSection = 'report' | 'images';

type CachedScheduleData = {
  schedule: TechnicianSchedule;
  images: OrderImage[];
  savedAt: string;
};

type PendingScheduleActions = {
  report?: {
    technician_diagnosis?: string | null;
    technician_solution?: string | null;
    technician_observations?: string | null;
  };
  checklist?: {
    items: string[];
  };
  savedAt: string;
};

const paymentMethods: { label: string; value: PaymentMethod; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { label: 'Pix', value: 'pix', icon: 'qr-code-2' },
  { label: 'Cartão', value: 'cartao', icon: 'credit-card' },
  { label: 'Dinheiro', value: 'dinheiro', icon: 'payments' },
  { label: 'Transferência', value: 'transferencia', icon: 'account-balance' },
];

export default function ScheduleDetailScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; section?: string }>();
  const { baseUrl, session } = useSession();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionOffsets = useRef<Partial<Record<DetailSection, number>>>({});
  const [schedule, setSchedule] = useState<TechnicianSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<ActionKind | null>(null);
  const [images, setImages] = useState<OrderImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<OrderImage | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [checklistLoading, setChecklistLoading] = useState(false);
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
  const [checklistFormItems, setChecklistFormItems] = useState<string[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingScheduleActions | null>(null);
  const [observations, setObservations] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const token = session?.accessToken;
  const tenantId = session?.user.tenant_id;
  const scheduleId = Number(params.id);
  const targetSection = params.section === 'report' || params.section === 'images' ? params.section : null;

  const applyScheduleState = useCallback((nextSchedule: TechnicianSchedule, nextImages: OrderImage[]) => {
    setSchedule(nextSchedule);
    setReportForm({
      diagnosis: nextSchedule.order?.technician_diagnosis ?? '',
      solution: nextSchedule.order?.technician_solution ?? '',
      observations: nextSchedule.order?.technician_observations ?? '',
    });
    setChecklistFormItems(getChecklistFormItems(nextSchedule));
    setImages(nextImages);
  }, []);

  const persistScheduleCache = useCallback(
    async (nextSchedule: TechnicianSchedule, nextImages: OrderImage[]) => {
      if (!tenantId) return;

      await AsyncStorage.setItem(
        getScheduleCacheKey(tenantId, nextSchedule.id),
        JSON.stringify({
          schedule: nextSchedule,
          images: nextImages,
          savedAt: new Date().toISOString(),
        }),
      ).catch(() => undefined);
    },
    [tenantId],
  );

  const syncPendingScheduleActions = useCallback(
    async (nextSchedule: TechnicianSchedule) => {
      if (!tenantId || !token) return nextSchedule;

      const pendingKey = getPendingScheduleKey(tenantId, nextSchedule.id);
      const pending = await readCache<PendingScheduleActions>(pendingKey);

      if (!pending) {
        setPendingActions(null);
        return nextSchedule;
      }

      let syncedSchedule = nextSchedule;

      if (pending.report) {
        syncedSchedule = await updateTechnicianScheduleReport(baseUrl, token, syncedSchedule.id, pending.report);
      }

      if (pending.checklist) {
        syncedSchedule = await updateTechnicianScheduleChecklist(baseUrl, token, syncedSchedule.id, pending.checklist);
      }

      await AsyncStorage.removeItem(pendingKey);
      setPendingActions(null);
      setMessage('Alterações pendentes sincronizadas.');

      return syncedSchedule;
    },
    [baseUrl, tenantId, token],
  );

  const loadSchedule = useCallback(async () => {
    if (!token || !tenantId || !Number.isFinite(scheduleId)) return;

    setLoading(true);
    setMessage(null);
    const cacheKey = getScheduleCacheKey(tenantId, scheduleId);
    const pendingKey = getPendingScheduleKey(tenantId, scheduleId);
    const cachedData = await readCache<CachedScheduleData>(cacheKey);
    const pendingData = await readCache<PendingScheduleActions>(pendingKey);

    setPendingActions(pendingData);

    if (cachedData) {
      applyScheduleState(cachedData.schedule, cachedData.images);
    }

    try {
      const scheduleResponse = await getTechnicianSchedule(baseUrl, token, scheduleId);
      let nextImages: OrderImage[] = [];

      if (scheduleResponse.order?.order_number) {
        nextImages = await getOrderImages(baseUrl, token, scheduleResponse.order.order_number);
      }

      const syncedSchedule = await syncPendingScheduleActions(scheduleResponse);

      applyScheduleState(syncedSchedule, nextImages);
      await persistScheduleCache(syncedSchedule, nextImages);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : cachedData ? 'Sem conexão. Exibindo atendimento salvo.' : 'Não foi possível carregar o atendimento.');
    } finally {
      setLoading(false);
    }
  }, [applyScheduleState, baseUrl, persistScheduleCache, scheduleId, syncPendingScheduleActions, tenantId, token]);

  useFocusEffect(
    useCallback(() => {
      loadSchedule();
    }, [loadSchedule]),
  );

  useEffect(() => {
    if (!schedule || !targetSection) return;

    const timeout = setTimeout(() => {
      const sectionOffset = sectionOffsets.current[targetSection];

      if (typeof sectionOffset === 'number') {
        scrollRef.current?.scrollTo({ y: Math.max(0, sectionOffset - 12), animated: true });
      }
    }, 180);

    return () => clearTimeout(timeout);
  }, [schedule, targetSection]);

  const address = useMemo(() => formatAddress(schedule), [schedule]);
  const mapsUrl = useMemo(() => schedule?.customer?.quick_actions?.maps_url ?? getMapsUrl(address), [address, schedule]);
  const phoneUrl = useMemo(() => schedule?.customer?.quick_actions?.phone_url ?? getPhoneUrl(schedule?.customer?.phone), [schedule]);
  const whatsappUrl = useMemo(() => schedule?.customer?.quick_actions?.whatsapp_url ?? getWhatsAppUrl(schedule?.customer?.whatsapp), [schedule]);
  const checkoutRequirements = useMemo(() => getCheckoutRequirements(schedule, pendingActions), [pendingActions, schedule]);
  const checklistItems = useMemo(() => getChecklistItems(schedule), [schedule]);
  const savedChecklistItems = useMemo(() => getChecklistFormItems(schedule), [schedule]);
  const isChecklistDirty = useMemo(
    () => !sameStringSet(checklistFormItems, savedChecklistItems),
    [checklistFormItems, savedChecklistItems],
  );
  const canCheckIn = Boolean(schedule && schedule.status !== 3 && !schedule.check_in?.at);
  const canAttemptCheckOut = Boolean(schedule && schedule.status !== 3 && schedule.check_in?.at && !schedule.check_out?.at);
  const canCheckOut = canAttemptCheckOut && checkoutRequirements.length === 0;
  const imageLimit = getImageLimit(schedule, images.length);
  const canUploadImage = schedule?.available_actions?.can_upload_images !== false && images.length < imageLimit;
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
      await persistScheduleCache(updated, images);
      setObservations('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível registrar a ação.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveReport() {
    if (!token || !schedule) return;

    setReportLoading(true);
    setMessage(null);
    const payload = {
      technician_diagnosis: normalizeText(reportForm.diagnosis),
      technician_solution: normalizeText(reportForm.solution),
      technician_observations: normalizeText(reportForm.observations),
    };

    try {
      const updated = await updateTechnicianScheduleReport(baseUrl, token, schedule.id, payload);

      setSchedule(updated);
      await persistScheduleCache(updated, images);
      await removePendingScheduleAction(tenantId, schedule.id, 'report', setPendingActions);
      setReportForm({
        diagnosis: updated.order?.technician_diagnosis ?? '',
        solution: updated.order?.technician_solution ?? '',
        observations: updated.order?.technician_observations ?? '',
      });
    } catch (error) {
      if (!(error instanceof ApiError)) {
        const optimisticSchedule = applyReportToSchedule(schedule, payload);

        setSchedule(optimisticSchedule);
        await persistScheduleCache(optimisticSchedule, images);
        await savePendingScheduleAction(tenantId, schedule.id, { report: payload }, setPendingActions);
        setMessage('Sem conexão. Relatório salvo para sincronizar.');
        setReportLoading(false);
        return;
      }

      setMessage(error instanceof ApiError ? error.message : 'Não foi possível salvar o relatório técnico.');
    } finally {
      setReportLoading(false);
    }
  }

  function handleToggleChecklistItem(item: string) {
    setChecklistFormItems((current) => {
      if (current.includes(item)) {
        return current.filter((value) => value !== item);
      }

      return [...current, item];
    });
  }

  async function handleSaveChecklist() {
    if (!token || !schedule) return;

    setChecklistLoading(true);
    setMessage(null);
    const payload = {
      items: normalizeChecklistItems(checklistFormItems),
    };

    try {
      const updated = await updateTechnicianScheduleChecklist(baseUrl, token, schedule.id, payload);

      setSchedule(updated);
      await persistScheduleCache(updated, images);
      await removePendingScheduleAction(tenantId, schedule.id, 'checklist', setPendingActions);
      setChecklistFormItems(getChecklistFormItems(updated));
    } catch (error) {
      if (!(error instanceof ApiError)) {
        const optimisticSchedule = applyChecklistToSchedule(schedule, payload.items);

        setSchedule(optimisticSchedule);
        await persistScheduleCache(optimisticSchedule, images);
        await savePendingScheduleAction(tenantId, schedule.id, { checklist: payload }, setPendingActions);
        setMessage('Sem conexão. Checklist salvo para sincronizar.');
        setChecklistLoading(false);
        return;
      }

      setMessage(error instanceof ApiError ? error.message : 'Não foi possível salvar o checklist.');
    } finally {
      setChecklistLoading(false);
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
      await persistScheduleCache(updated, images);
      setPaymentForm({ amount: '', method: 'pix', notes: '' });
      setMessage('Pagamento enviado para conferencia do caixa.');
    } catch (error) {
<<<<<<< HEAD
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível registrar o pagamento.');
=======
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel enviar o pagamento para conferencia.');
>>>>>>> b28bf68ccd1ee2a12e680d8ff531859bc1f402b9
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
      const nextImages = await getOrderImages(baseUrl, token, schedule.order.order_number);
      setImages(nextImages);
      await persistScheduleCache(schedule, nextImages);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível anexar a imagem.');
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
      const nextImages = images.filter((item) => item.id !== image.id);
      setImages(nextImages);
      setSelectedImage((current) => (current?.id === image.id ? null : current));
      await persistScheduleCache(schedule, nextImages);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível remover a imagem.');
    } finally {
      setImageLoading(false);
    }
  }

  async function handleSyncPendingActions() {
    if (!token || !schedule) return;

    setLoading(true);
    setMessage(null);

    try {
      const refreshedSchedule = await getTechnicianSchedule(baseUrl, token, schedule.id);
      let nextImages = images;

      if (refreshedSchedule.order?.order_number) {
        nextImages = await getOrderImages(baseUrl, token, refreshedSchedule.order.order_number);
      }

      const syncedSchedule = await syncPendingScheduleActions(refreshedSchedule);

      applyScheduleState(syncedSchedule, nextImages);
      await persistScheduleCache(syncedSchedule, nextImages);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível sincronizar as alterações agora.');
    } finally {
      setLoading(false);
    }
  }

  function handleConfirmDeleteImage(image: OrderImage) {
    Alert.alert('Remover imagem?', 'A imagem será excluída deste atendimento.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => handleDeleteImage(image) },
    ]);
  }

  if (!session) {
    return (
      <AppShell>
        <TextMuted>Entre no app para acessar o atendimento.</TextMuted>
      </AppShell>
    );
  }

  return (
    <AppShell scrollRef={scrollRef}>
      <View style={[styles.pageHeader, { backgroundColor: colors.accent, paddingTop: Math.max(18, insets.top + 12) }]}>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
            <MaterialIcons name="arrow-back" size={22} color="#ffffff" />
          </Pressable>
          <Pressable
            disabled={loading}
            onPress={loadSchedule}
            style={({ pressed }) => [styles.headerIconButton, { opacity: loading ? 0.58 : pressed ? 0.72 : 1 }]}>
            <MaterialIcons name={loading ? 'sync' : 'refresh'} size={22} color="#ffffff" />
          </Pressable>
        </View>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEyebrow}>Atendimento técnico</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {schedule ? `Agenda #${schedule.schedules_number}` : 'Carregando agenda'}
          </Text>
          <Text style={styles.headerDetail}>{schedule ? formatDateTime(schedule.schedules) : 'Sincronizando dados do atendimento'}</Text>
        </View>
      </View>

      {message ? <Message tone="error">{message}</Message> : null}
      {pendingActions ? (
        <Card>
          <DataNote icon="sync-problem" title="Alterações offline" detail={pendingActionsDetail(pendingActions)} />
          <Button onPress={handleSyncPendingActions} loading={loading}>
            Sincronizar agora
          </Button>
        </Card>
      ) : null}

      {schedule ? (
        <>
          <Card>
            <View style={styles.titleRow}>
              <View style={styles.titleText}>
                <Text style={[styles.kicker, { color: colors.mutedText }]}>Cliente</Text>
                <Title>{schedule.customer?.name ?? 'Cliente não informado'}</Title>
              </View>
              <StatusPill label={schedule.technician_status_label ?? schedule.status_label ?? 'Agendado'} status={schedule.status} />
            </View>

            <View style={styles.infoGrid}>
              <InfoRow icon="build" label="Serviço" value={schedule.service ?? schedule.details ?? 'Serviço não informado'} />
              <InfoRow icon="place" label="Endereço" value={address ?? 'Endereço não informado'} />
              <InfoRow icon="phone" label="Telefone" value={schedule.customer?.phone ?? 'Não informado'} />
              <InfoRow icon="chat" label="WhatsApp" value={schedule.customer?.whatsapp ?? 'Não informado'} />
            </View>

            <View style={styles.quickActions}>
              {mapsUrl ? <IconAction icon="route" label="Rota" onPress={() => Linking.openURL(mapsUrl)} /> : null}
              {phoneUrl ? <IconAction icon="call" label="Ligar" onPress={() => Linking.openURL(phoneUrl)} /> : null}
              {whatsappUrl ? <IconAction icon="chat" label="Whats" onPress={() => Linking.openURL(whatsappUrl)} /> : null}
            </View>
          </Card>

          <Card>
            <PanelHeader title="Execução do atendimento" detail={nextActionText(canCheckIn, canAttemptCheckOut, checkoutRequirements)} />
            <View style={[styles.actionSummary, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <View style={[styles.actionSummaryIcon, { backgroundColor: canAttemptCheckOut && checkoutRequirements.length === 0 ? colors.success : colors.tint }]}>
                <MaterialIcons name={canAttemptCheckOut ? 'flag' : canCheckIn ? 'my-location' : 'task-alt'} size={20} color="#ffffff" />
              </View>
              <View style={styles.actionSummaryText}>
                <Text style={[styles.actionSummaryLabel, { color: colors.mutedText }]}>Próxima etapa</Text>
                <Text style={[styles.actionSummaryValue, { color: colors.text }]}>{nextActionTitle(canCheckIn, canAttemptCheckOut, checkoutRequirements)}</Text>
              </View>
            </View>
            {canAttemptCheckOut && checkoutRequirements.length > 0 ? (
              <View style={styles.requirementsList}>
                {checkoutRequirements.map((requirement) => (
                  <RequirementItem key={requirement} text={requirement} />
                ))}
              </View>
            ) : null}
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
              placeholder="Observações do atendimento"
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
                <Button onPress={() => handleAttendanceAction('check-out')} loading={actionLoading === 'check-out'} disabled={!canCheckOut}>
                  Registrar check-out
                </Button>
              ) : null}
              {canAttemptCheckOut && !canCheckOut ? (
                <Button disabled>
                  Check-out bloqueado
                </Button>
              ) : null}
              {!canCheckIn && !canAttemptCheckOut ? <TextMuted>Nenhuma ação pendente para este atendimento.</TextMuted> : null}
            </View>
          </Card>

          {schedule.order ? (
            <Card>
              <PanelHeader title="Ordem de serviço" detail="Dados técnicos vinculados ao atendimento" />
              <View style={styles.infoGrid}>
                <InfoRow icon="confirmation-number" label="OS" value={String(schedule.order.order_number)} />
                <InfoRow icon="precision-manufacturing" label="Equipamento" value={schedule.order.equipment?.equipment ?? 'Não informado'} />
                <InfoRow icon="devices" label="Modelo" value={schedule.order.model ?? 'Não informado'} />
                <InfoRow icon="report-problem" label="Defeito" value={schedule.order.defect ?? 'Não informado'} />
                <InfoRow icon="fact-check" label="Estado" value={schedule.order.state_conservation ?? 'Não informado'} />
                <InfoRow icon="inventory-2" label="Acessórios" value={schedule.order.accessories ?? 'Não informado'} />
                <InfoRow icon="notes" label="Observações" value={schedule.order.observations ?? 'Não informado'} wide />
              </View>
            </Card>
          ) : null}

          {schedule.order ? (
            <View onLayout={(event) => { sectionOffsets.current.report = event.nativeEvent.layout.y; }}>
              <Card>
                <PanelHeader title="Relatório técnico" detail={schedule.order.technician_attended_at ? `Atualizado em ${formatDateTime(schedule.order.technician_attended_at)}` : 'Diagnóstico e solução do atendimento'} />
                <TextInput
                  multiline
                  value={reportForm.diagnosis}
                  onChangeText={(value) => setReportForm((current) => ({ ...current, diagnosis: value }))}
                  placeholder="Diagnóstico encontrado"
                  placeholderTextColor={colors.mutedText}
                  style={[styles.notesInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
                />
                <TextInput
                  multiline
                  value={reportForm.solution}
                  onChangeText={(value) => setReportForm((current) => ({ ...current, solution: value }))}
                  placeholder="Solução aplicada"
                  placeholderTextColor={colors.mutedText}
                  style={[styles.notesInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
                />
                <TextInput
                  multiline
                  value={reportForm.observations}
                  onChangeText={(value) => setReportForm((current) => ({ ...current, observations: value }))}
                  placeholder="Observações finais"
                  placeholderTextColor={colors.mutedText}
                  style={[styles.notesInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
                />
                <Button onPress={handleSaveReport} loading={reportLoading}>
                  Salvar relatório
                </Button>
              </Card>
            </View>
          ) : null}

          {schedule.order && checklistItems.length > 0 ? (
            <Card>
              <PanelHeader title="Checklist técnico" detail={`${savedChecklistItems.length}/${checklistItems.length} itens salvos`} />
              <View style={styles.checklistList}>
                {checklistItems.map((item) => (
                  <ChecklistItem
                    key={item}
                    label={item}
                    checked={checklistFormItems.includes(item)}
                    onPress={() => handleToggleChecklistItem(item)}
                  />
                ))}
              </View>
              {isChecklistComplete(schedule) ? (
                <DataNote icon="verified" title="Checklist concluído" detail="Todos os itens obrigatórios foram salvos." />
              ) : null}
              <Button onPress={handleSaveChecklist} loading={checklistLoading} disabled={!isChecklistDirty}>
                Salvar checklist
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
<<<<<<< HEAD
                  icon="verified"
                  title="Pagamento registrado pelo técnico"
=======
                  icon={schedule.order.technician_local_payment_status === 'confirmed' ? 'verified' : 'pending-actions'}
                  title={
                    schedule.order.technician_local_payment_status === 'confirmed'
                      ? 'Pagamento conferido no caixa'
                      : 'Pagamento aguardando conferencia'
                  }
>>>>>>> b28bf68ccd1ee2a12e680d8ff531859bc1f402b9
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
                placeholder="Observação do pagamento"
                placeholderTextColor={colors.mutedText}
                style={[styles.notesInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
              />
              <Button onPress={handleRecordPayment} loading={paymentLoading}>
                Enviar para conferencia
              </Button>
            </Card>
          ) : null}

          {schedule.order ? (
            <View onLayout={(event) => { sectionOffsets.current.images = event.nativeEvent.layout.y; }}>
              <Card>
                <PanelHeader title="Imagens do atendimento" detail={`${images.length}/${imageLimit} imagens anexadas`} />
                <View style={styles.quickActions}>
                  <IconAction icon="photo-camera" label={imageLoading ? 'Enviando' : 'Câmera'} onPress={() => handlePickImage('camera')} disabled={imageLoading || !canUploadImage} />
                  <IconAction icon="photo-library" label="Galeria" onPress={() => handlePickImage('library')} disabled={imageLoading || !canUploadImage} />
                </View>
                {!canUploadImage ? <TextMuted>Limite de imagens atingido para esta OS.</TextMuted> : null}
                {images.length > 0 ? (
                  <View style={styles.imageGrid}>
                    {images.map((image) => (
                      <View key={image.id} style={[styles.imageTile, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                        <Pressable onPress={() => setSelectedImage(image)} style={styles.imagePreviewButton}>
                          <Image source={{ uri: getOrderImageUrl(baseUrl, schedule.order?.order_number, image.filename) }} style={styles.orderImage} resizeMode="cover" />
                        </Pressable>
                        <Pressable
                          disabled={imageLoading}
                          onPress={() => handleConfirmDeleteImage(image)}
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
            </View>
          ) : null}

          <ImagePreviewModal
            image={selectedImage}
            imageUri={selectedImage && schedule.order ? getOrderImageUrl(baseUrl, schedule.order.order_number, selectedImage.filename) : null}
            loading={imageLoading}
            onClose={() => setSelectedImage(null)}
            onDelete={(image) => handleConfirmDeleteImage(image)}
          />
        </>
      ) : (
        <Card>
          <TextMuted>{loading ? 'Carregando atendimento...' : 'Atendimento não encontrado.'}</TextMuted>
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

function nextActionText(canCheckIn: boolean, canAttemptCheckOut: boolean, requirements: string[]) {
  if (canCheckIn) return 'Próxima ação: registrar chegada ao cliente.';
  if (canAttemptCheckOut && requirements.length === 0) return 'Próxima ação: finalizar atendimento no local.';
  if (canAttemptCheckOut) return 'Conclua as pendências para liberar o check-out.';

  return 'Atendimento sem ação pendente.';
}

function nextActionTitle(canCheckIn: boolean, canAttemptCheckOut: boolean, requirements: string[]) {
  if (canCheckIn) return 'Registrar chegada ao cliente';
  if (canAttemptCheckOut && requirements.length === 0) return 'Finalizar atendimento no local';
  if (canAttemptCheckOut) return 'Pendências antes do check-out';

  return 'Atendimento sem pendências';
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

function RequirementItem({ text }: { text: string }) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={[styles.requirementItem, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <MaterialIcons name="error-outline" size={18} color="#a05a00" />
      <Text style={[styles.requirementText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function ChecklistItem({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.checklistItem,
        {
          backgroundColor: checked ? `${colors.success}12` : colors.muted,
          borderColor: checked ? colors.success : colors.border,
          opacity: pressed ? 0.72 : 1,
        },
      ]}>
      <View style={[styles.checklistBox, { backgroundColor: checked ? colors.success : 'transparent', borderColor: checked ? colors.success : colors.border }]}>
        {checked ? <MaterialIcons name="check" size={16} color="#ffffff" /> : null}
      </View>
      <Text style={[styles.checklistText, { color: colors.text }]}>{label}</Text>
    </Pressable>
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

function ImagePreviewModal({
  image,
  imageUri,
  loading,
  onClose,
  onDelete,
}: {
  image: OrderImage | null;
  imageUri: string | null;
  loading: boolean;
  onClose: () => void;
  onDelete: (image: OrderImage) => void;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];

  if (!image || !imageUri) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewOverlay}>
        <View style={[styles.previewHeader, { paddingTop: 18 }]}>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.previewIconButton, pressed && styles.pressed]}>
            <MaterialIcons name="close" size={24} color="#ffffff" />
          </Pressable>
          <Pressable
            disabled={loading}
            onPress={() => onDelete(image)}
            style={({ pressed }) => [styles.previewIconButton, { opacity: loading ? 0.58 : pressed ? 0.72 : 1 }]}>
            <MaterialIcons name="delete" size={22} color="#ffffff" />
          </Pressable>
        </View>
        <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
        <View style={styles.previewFooter}>
          <Text style={[styles.previewText, { color: colors.accentText }]}>Imagem do atendimento</Text>
        </View>
      </View>
    </Modal>
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

function getChecklistItems(schedule: TechnicianSchedule | null) {
  return normalizeChecklistItems(schedule?.order?.equipment?.checklist_items ?? []);
}

function getCompletedChecklistItems(schedule: TechnicianSchedule | null) {
  return normalizeChecklistItems(schedule?.order?.technician_checklist_items ?? []);
}

function getChecklistFormItems(schedule: TechnicianSchedule | null) {
  const requiredItems = getChecklistItems(schedule);
  const completedItems = getCompletedChecklistItems(schedule);

  if (requiredItems.length === 0) return completedItems;

  const requiredSet = new Set(requiredItems);

  return completedItems.filter((item) => requiredSet.has(item));
}

function isReportReady(schedule: TechnicianSchedule | null) {
  const order = schedule?.order;

  return Boolean(order?.technician_diagnosis?.trim() && order.technician_solution?.trim());
}

function isChecklistComplete(schedule: TechnicianSchedule | null) {
  const requiredItems = getChecklistItems(schedule);

  if (requiredItems.length === 0) return true;

  const completedItems = new Set(getCompletedChecklistItems(schedule));

  return requiredItems.every((item) => completedItems.has(item));
}

function getCheckoutRequirements(schedule: TechnicianSchedule | null, pendingActions: PendingScheduleActions | null) {
  if (!schedule?.order) return [];

  const requirements: string[] = [];

  if (pendingActions?.report || pendingActions?.checklist) {
    requirements.push('Sincronizar alterações salvas offline.');
  }

  if (!isReportReady(schedule)) {
    requirements.push('Salvar diagnóstico e solução do relatório técnico.');
  }

  if (!isChecklistComplete(schedule)) {
    requirements.push('Concluir e salvar todos os itens do checklist.');
  }

  return requirements;
}

function pendingActionsDetail(pendingActions: PendingScheduleActions) {
  const actions = [
    pendingActions.report ? 'relatório' : null,
    pendingActions.checklist ? 'checklist' : null,
  ].filter(Boolean);

  if (actions.length === 0) return 'Aguardando sincronização.';

  return `${actions.join(' e ')} aguardando sincronização.`;
}

function sameStringSet(first: string[], second: string[]) {
  const normalizedFirst = normalizeChecklistItems(first);
  const normalizedSecond = normalizeChecklistItems(second);

  if (normalizedFirst.length !== normalizedSecond.length) return false;

  const secondSet = new Set(normalizedSecond);

  return normalizedFirst.every((item) => secondSet.has(item));
}

function normalizeChecklistItems(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter((item) => item.length > 0)));
}

function getScheduleCacheKey(tenantId: number, scheduleId: number) {
  return `@VetorTecnico:schedule:${tenantId}:${scheduleId}`;
}

function getPendingScheduleKey(tenantId: number, scheduleId: number) {
  return `@VetorTecnico:pending-schedule:${tenantId}:${scheduleId}`;
}

async function savePendingScheduleAction(
  tenantId: number | undefined,
  scheduleId: number,
  patch: Partial<PendingScheduleActions>,
  setPendingActions: Dispatch<SetStateAction<PendingScheduleActions | null>>,
) {
  if (!tenantId) return;

  const key = getPendingScheduleKey(tenantId, scheduleId);
  const current = (await readCache<PendingScheduleActions>(key)) ?? { savedAt: new Date().toISOString() };
  const next = {
    ...current,
    ...patch,
    savedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(key, JSON.stringify(next));
  setPendingActions(next);
}

async function removePendingScheduleAction(
  tenantId: number | undefined,
  scheduleId: number,
  action: 'report' | 'checklist',
  setPendingActions: Dispatch<SetStateAction<PendingScheduleActions | null>>,
) {
  if (!tenantId) return;

  const key = getPendingScheduleKey(tenantId, scheduleId);
  const current = await readCache<PendingScheduleActions>(key);

  if (!current) return;

  const next: PendingScheduleActions = { ...current, savedAt: new Date().toISOString() };
  delete next[action];

  if (!next.report && !next.checklist) {
    await AsyncStorage.removeItem(key);
    setPendingActions(null);
    return;
  }

  await AsyncStorage.setItem(key, JSON.stringify(next));
  setPendingActions(next);
}

function applyReportToSchedule(
  schedule: TechnicianSchedule,
  report: NonNullable<PendingScheduleActions['report']>,
) {
  if (!schedule.order) return schedule;

  return {
    ...schedule,
    order: {
      ...schedule.order,
      technician_diagnosis: report.technician_diagnosis ?? null,
      technician_solution: report.technician_solution ?? null,
      technician_observations: report.technician_observations ?? null,
      technician_attended_at: schedule.order.technician_attended_at ?? new Date().toISOString(),
    },
  };
}

function applyChecklistToSchedule(schedule: TechnicianSchedule, items: string[]) {
  if (!schedule.order) return schedule;

  const normalizedItems = normalizeChecklistItems(items);

  return {
    ...schedule,
    order: {
      ...schedule.order,
      technician_checklist_items: normalizedItems,
      technician_checklist_completed_at: normalizedItems.length > 0 ? new Date().toISOString() : null,
    },
  };
}

async function readCache<T>(key: string) {
  const value = await AsyncStorage.getItem(key);

  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
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

function getPhoneUrl(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, '') ?? '';

  return digits ? `tel:${digits}` : null;
}

function getWhatsAppUrl(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, '') ?? '';

  if (!digits) return null;

  const normalized = digits.length > 11 ? digits : `55${digits}`;

  return `https://wa.me/${normalized}`;
}

function getImageLimit(schedule: TechnicianSchedule | null, currentImages: number) {
  const remainingImages = schedule?.available_actions?.remaining_images;

  return typeof remainingImages === 'number' ? currentImages + remainingImages : 4;
}

function showPermissionSettingsAlert(title: string, message: string) {
  Alert.alert(title, message, [
    { text: 'Agora não', style: 'cancel' },
    { text: 'Abrir ajustes', onPress: () => Linking.openSettings().catch(() => undefined) },
  ]);
}

async function getCurrentCoordinates() {
  const permission = await Location.requestForegroundPermissionsAsync();

  if (permission.status !== Location.PermissionStatus.GRANTED) {
    showPermissionSettingsAlert('Localização', 'Permita o acesso à localização para registrar check-in e check-out.');
    throw new ApiError('Permita o acesso à localização para registrar a ação.', 422);
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
    showPermissionSettingsAlert('Câmera', 'Permita o acesso à câmera para anexar imagens do atendimento.');
    throw new ApiError('Permita o acesso à câmera para anexar imagens.', 422);
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
    showPermissionSettingsAlert('Galeria', 'Permita o acesso à galeria para anexar imagens do atendimento.');
    throw new ApiError('Permita o acesso à galeria para anexar imagens.', 422);
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
  if (!latitude || !longitude) return 'Não registrado';

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
  return paymentMethods.find((method) => method.value === value)?.label ?? 'Não informado';
}

function normalizeText(value: string) {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

const styles = StyleSheet.create({
  pageHeader: {
    marginHorizontal: -16,
    marginTop: -18,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 20,
    overflow: 'hidden',
  },
  headerActions: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitleWrap: {
    gap: 2,
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
    fontSize: 27,
    lineHeight: 33,
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
  requirementsList: {
    gap: 8,
  },
  requirementItem: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  requirementText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  checklistList: {
    gap: 10,
  },
  checklistItem: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checklistBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
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
  imagePreviewButton: {
    width: '100%',
    height: '100%',
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
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8, 13, 22, 0.96)',
  },
  previewHeader: {
    minHeight: 72,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewIconButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  previewImage: {
    flex: 1,
    width: '100%',
  },
  previewFooter: {
    minHeight: 54,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
  },
});
