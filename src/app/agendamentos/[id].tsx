import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppShell } from '@/components/app-shell';
import { Button, Card, Message, TextMuted, Title } from '@/components/ui-kit';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  ApiError,
  checkInTechnicianSchedule,
  checkOutTechnicianSchedule,
  deleteTechnicianScheduleImage,
  getTechnicianScheduleImages,
  getTechnicianSchedule,
  recordTechnicianSchedulePayment,
  requestTechnicianScheduleClosure,
  ScheduleMaterialChecklistItem,
  ScheduleImage,
  TechnicianSchedule,
  updateTechnicianScheduleChecklist,
  updateTechnicianScheduleReport,
  uploadTechnicianScheduleImage,
} from '@/lib/api';
import { useSession } from '@/lib/session-context';

type ActionKind = 'check-in' | 'check-out';

export default function ScheduleDetailScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const params = useLocalSearchParams<{ id?: string }>();
  const { baseUrl, session } = useSession();
  const [schedule, setSchedule] = useState<TechnicianSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<ActionKind | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [equipmentChecklistLoading, setEquipmentChecklistLoading] = useState(false);
  const [images, setImages] = useState<ScheduleImage[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportForm, setReportForm] = useState({
    diagnosis: '',
    solution: '',
    observations: '',
  });
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [closureLoading, setClosureLoading] = useState(false);
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
        diagnosis: scheduleResponse.technician_report?.diagnosis ?? '',
        solution: scheduleResponse.technician_report?.solution ?? '',
        observations: scheduleResponse.technician_report?.observations ?? '',
      });
      setPaymentAmount(formatPaymentInput(scheduleResponse.local_payment?.amount));
      setImages(await getTechnicianScheduleImages(baseUrl, token, scheduleId));
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
  const canCheckOut = Boolean(schedule?.available_actions?.can_check_out);
  const materialChecklist = normalizeMaterialChecklist(schedule?.material_checklist);
  const equipmentChecklist = normalizeEquipmentChecklist(schedule);

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

  async function handleToggleMaterial(itemIndex: number) {
    if (!token || !schedule) return;

    const nextItems = materialChecklist.map((item, index) => (index === itemIndex ? { ...item, used: !item.used } : item));
    setChecklistLoading(true);
    setMessage(null);

    try {
      const updated = await updateTechnicianScheduleChecklist(baseUrl, token, schedule.id, {
        material_checklist: nextItems,
      });
      setSchedule(updated);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel atualizar os materiais.');
    } finally {
      setChecklistLoading(false);
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
        diagnosis: updated.technician_report?.diagnosis ?? '',
        solution: updated.technician_report?.solution ?? '',
        observations: updated.technician_report?.observations ?? '',
      });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel salvar o relatorio tecnico.');
    } finally {
      setReportLoading(false);
    }
  }

  async function handleToggleEquipmentChecklist(item: string) {
    if (!token || !schedule) return;

    const completed = new Set(schedule.order?.technician_checklist_items ?? []);

    if (completed.has(item)) {
      completed.delete(item);
    } else {
      completed.add(item);
    }

    setEquipmentChecklistLoading(true);
    setMessage(null);

    try {
      const updated = await updateTechnicianScheduleChecklist(baseUrl, token, schedule.id, {
        items: Array.from(completed),
      });
      setSchedule(updated);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel atualizar o checklist tecnico.');
    } finally {
      setEquipmentChecklistLoading(false);
    }
  }

  async function handlePickImage(source: 'camera' | 'library') {
    if (!token || !schedule) return;

    setImageLoading(true);
    setMessage(null);

    try {
      const result = source === 'camera' ? await launchCamera() : await launchLibrary();

      if (result.canceled || !result.assets[0]?.base64) return;

      await uploadTechnicianScheduleImage(baseUrl, token, schedule.id, result.assets[0].base64);
      setImages(await getTechnicianScheduleImages(baseUrl, token, schedule.id));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel anexar a imagem.');
    } finally {
      setImageLoading(false);
    }
  }

  async function handleDeleteImage(image: ScheduleImage) {
    if (!token || !schedule) return;

    setImageLoading(true);
    setMessage(null);

    try {
      await deleteTechnicianScheduleImage(baseUrl, token, schedule.id, image.id);
      setImages((current) => current.filter((item) => item.id !== image.id));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel remover a imagem.');
    } finally {
      setImageLoading(false);
    }
  }

  function confirmDeleteImage(image: ScheduleImage) {
    Alert.alert('Remover foto?', 'A foto será excluída permanentemente deste atendimento.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => void handleDeleteImage(image) },
    ]);
  }

  async function handleRecordPayment() {
    if (!token || !schedule) return;

    const amount = Number(schedule.service_closure?.amount ?? 0);

    if (!amount || amount <= 0) {
      setMessage('Informe um valor maior que zero para marcar como pago.');
      return;
    }

    setPaymentLoading(true);
    setMessage(null);

    try {
      const updated = await recordTechnicianSchedulePayment(baseUrl, token, schedule.id, {
        paid: true,
        amount,
      });
      setSchedule(updated);
      setPaymentAmount(formatPaymentInput(updated.local_payment?.amount));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel registrar o pagamento.');
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleRequestClosure() {
    if (!token || !schedule) return;

    setClosureLoading(true);
    setMessage(null);

    try {
      const updated = await requestTechnicianScheduleClosure(baseUrl, token, schedule.id);
      setSchedule(updated);
      setPaymentAmount('');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel solicitar o valor do atendimento.');
    } finally {
      setClosureLoading(false);
    }
  }

  function openClosureWhatsApp() {
    if (!schedule?.service_closure?.office_whatsapp_url) return;

    const usedMaterials = materialChecklist
      .filter((item) => item.used)
      .map((item) => `${item.quantity}x ${item.name}`)
      .join(', ');
    const message = [
      `Solicitação de valor do agendamento #${schedule.schedules_number}.`,
      schedule.customer?.name ? `Cliente: ${schedule.customer.name}.` : null,
      schedule.order?.order_number ? `OS: #${schedule.order.order_number}.` : null,
      usedMaterials ? `Materiais utilizados: ${usedMaterials}.` : 'Nenhum material marcado como utilizado.',
      'Relatório técnico preenchido no VetorOS.',
    ]
      .filter(Boolean)
      .join('\n');

    Linking.openURL(`${schedule.service_closure.office_whatsapp_url}?text=${encodeURIComponent(message)}`);
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
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEyebrow}>Atendimento técnico</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {schedule ? `Agenda #${schedule.schedules_number}` : 'Carregando agenda'}
          </Text>
          <Text style={styles.headerDetail}>{schedule ? formatDateTime(schedule.schedules) : 'Sincronizando dados do atendimento'}</Text>
        </View>
        <Pressable
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Atualizar atendimento"
          onPress={loadSchedule}
          style={({ pressed }) => [styles.headerIconButton, { opacity: loading ? 0.58 : pressed ? 0.72 : 1 }]}>
          {loading ? <ActivityIndicator size="small" color="#ffffff" /> : <MaterialIcons name="refresh" size={22} color="#ffffff" />}
        </Pressable>
      </View>

      {message ? <Message tone="error">{message}</Message> : null}

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
              <InfoRow icon="notes" label="Detalhes" value={schedule.details ?? 'Não informado'} />
              <InfoRow icon="place" label="Endereço" value={address ?? 'Endereço não informado'} />
              <InfoRow icon="phone" label="Telefone" value={schedule.customer?.phone ?? 'Não informado'} />
              <InfoRow icon="chat" label="WhatsApp" value={schedule.customer?.whatsapp ?? 'Não informado'} />
            </View>

            <View style={styles.quickActions}>
              {mapsUrl ? <IconAction icon="route" label="Rota" onPress={() => Linking.openURL(mapsUrl)} /> : null}
              {schedule.customer?.phone ? <IconAction icon="call" label="Ligar" onPress={() => Linking.openURL(`tel:${schedule.customer?.phone ?? ''}`)} /> : null}
              {schedule.customer?.whatsapp ? <IconAction icon="chat" label="Whats" onPress={() => openWhatsApp(schedule.customer?.whatsapp ?? '')} /> : null}
            </View>
          </Card>

          <Card>
            <PanelHeader
              title="Execução do atendimento"
              detail={
                schedule.service_closure?.status === 'requested'
                  ? 'Aguardando a empresa definir o valor'
                  : schedule.service_closure?.status === 'priced'
                    ? `Valor liberado: ${formatCurrency(schedule.service_closure.amount)}`
                    : nextActionText(canCheckIn, canCheckOut)
              }
            />
            <View style={[styles.actionSummary, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <View style={[styles.actionSummaryIcon, { backgroundColor: canCheckOut ? colors.success : colors.tint }]}>
                <MaterialIcons name={canCheckOut ? 'flag' : canCheckIn ? 'my-location' : 'task-alt'} size={20} color="#ffffff" />
              </View>
              <View style={styles.actionSummaryText}>
                <Text style={[styles.actionSummaryLabel, { color: colors.mutedText }]}>Próxima etapa</Text>
                <Text style={[styles.actionSummaryValue, { color: colors.text }]}>{nextActionTitle(canCheckIn, canCheckOut)}</Text>
              </View>
            </View>
            <View style={styles.timeline}>
              <TimelineItem label="Check-in" value={formatOptionalDateTime(schedule.check_in?.at)} done={Boolean(schedule.check_in?.at)} />
              <TimelineItem label="GPS check-in" value={formatCoordinates(schedule.check_in?.latitude, schedule.check_in?.longitude)} done={Boolean(schedule.check_in?.latitude && schedule.check_in?.longitude)} />
              <TimelineItem label="Check-out" value={formatOptionalDateTime(schedule.check_out?.at)} done={Boolean(schedule.check_out?.at)} />
              <TimelineItem label="GPS check-out" value={formatCoordinates(schedule.check_out?.latitude, schedule.check_out?.longitude)} done={Boolean(schedule.check_out?.latitude && schedule.check_out?.longitude)} />
            </View>
            <LabeledTextArea
              label="Observações desta etapa"
              value={observations}
              onChangeText={setObservations}
              placeholder="Registre informações úteis sobre a chegada ou finalização"
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
              {!canCheckIn && !schedule.check_out?.at && !schedule.service_closure?.status ? (
                <Button onPress={handleRequestClosure} loading={closureLoading}>
                  Fechar serviço e solicitar valor
                </Button>
              ) : null}
              {schedule.service_closure?.status === 'requested' ? (
                <>
                  <TextMuted>O checkout será liberado quando a empresa informar o valor.</TextMuted>
                  {schedule.service_closure.office_whatsapp_url ? (
                    <Button variant="secondary" onPress={openClosureWhatsApp}>
                      Solicitar prioridade pelo WhatsApp
                    </Button>
                  ) : null}
                  <Button variant="secondary" onPress={() => void loadSchedule()} loading={loading}>
                    Verificar valor
                  </Button>
                </>
              ) : null}
              {!canCheckIn && !canCheckOut && schedule.check_out?.at ? <TextMuted>Atendimento finalizado.</TextMuted> : null}
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

          <Card>
            <PanelHeader
              title="Relatório técnico"
              detail={
                schedule.technician_report?.updated_at
                  ? `Atualizado em ${formatDateTime(schedule.technician_report.updated_at)}`
                  : 'Diagnóstico e solução do atendimento'
              }
            />
            <LabeledTextArea
              label="Diagnóstico"
              value={reportForm.diagnosis}
              onChangeText={(value) => setReportForm((current) => ({ ...current, diagnosis: value }))}
              placeholder="Descreva o problema encontrado"
            />
            <LabeledTextArea
              label="Solução aplicada"
              value={reportForm.solution}
              onChangeText={(value) => setReportForm((current) => ({ ...current, solution: value }))}
              placeholder="Descreva o serviço executado"
            />
            <LabeledTextArea
              label="Observações finais"
              value={reportForm.observations}
              onChangeText={(value) => setReportForm((current) => ({ ...current, observations: value }))}
              placeholder="Inclua recomendações ou informações adicionais"
            />
            <Button onPress={handleSaveReport} loading={reportLoading}>
              Salvar relatório
            </Button>
          </Card>

          {schedule.order ? (
            <Card>
              <PanelHeader title="Checklist técnico" detail={equipmentChecklistDetail(equipmentChecklist)} />
              {equipmentChecklist.length > 0 ? (
                <View style={styles.materialList}>
                  {equipmentChecklist.map((item) => (
                    <Pressable
                      key={item.label}
                      disabled={equipmentChecklistLoading || schedule.status === 3}
                      onPress={() => handleToggleEquipmentChecklist(item.label)}
                      style={({ pressed }) => [
                        styles.materialItem,
                        {
                          backgroundColor: colors.muted,
                          borderColor: item.completed ? colors.success : colors.border,
                          opacity: equipmentChecklistLoading ? 0.58 : pressed ? 0.72 : 1,
                        },
                      ]}>
                      <MaterialIcons name={item.completed ? 'check-circle' : 'radio-button-unchecked'} size={22} color={item.completed ? colors.success : colors.icon} />
                      <View style={styles.materialText}>
                        <Text style={[styles.infoValue, { color: colors.text }]}>{item.label}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <TextMuted>Sem checklist cadastrado para este equipamento.</TextMuted>
              )}
            </Card>
          ) : null}

          <Card>
            <PanelHeader title="Materiais do atendimento" detail={materialChecklistDetail(materialChecklist)} />
            {materialChecklist.length > 0 ? (
              <View style={styles.materialList}>
                {materialChecklist.map((item, index) => (
                  <Pressable
                    key={`${item.part_id ?? 'manual'}-${item.name}-${index}`}
                    disabled={checklistLoading || schedule.status === 3}
                    onPress={() => handleToggleMaterial(index)}
                    style={({ pressed }) => [
                      styles.materialItem,
                      {
                        backgroundColor: colors.muted,
                        borderColor: item.used ? colors.success : colors.border,
                        opacity: checklistLoading ? 0.58 : pressed ? 0.72 : 1,
                      },
                    ]}>
                    <MaterialIcons name={item.used ? 'check-circle' : 'radio-button-unchecked'} size={22} color={item.used ? colors.success : colors.icon} />
                    <View style={styles.materialText}>
                      <Text style={[styles.infoValue, { color: colors.text }]}>{item.name}</Text>
                      {item.quantity > 1 ? <Text style={[styles.infoLabel, { color: colors.mutedText }]}>Quantidade: {item.quantity}</Text> : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <TextMuted>Nenhum material informado para este atendimento.</TextMuted>
            )}
          </Card>

          <Card>
            <PanelHeader
              title="Pagamento no local"
              detail={
                schedule.local_payment?.received
                  ? `Pago: ${formatCurrency(schedule.local_payment.amount)}`
                  : schedule.service_closure?.status === 'priced'
                    ? `Valor definido pela empresa: ${formatCurrency(schedule.service_closure.amount)}`
                    : 'Solicite o fechamento para receber o valor'
              }
            />
            <View style={styles.paymentRow}>
              <View style={[styles.paymentIcon, { backgroundColor: schedule.local_payment?.received ? colors.success : colors.tint }]}>
                {schedule.local_payment?.received ? (
                  <MaterialIcons name="paid" size={22} color="#ffffff" />
                ) : (
                  <Text style={styles.paymentCurrencyIcon}>R$</Text>
                )}
              </View>
              <TextInput
                value={
                  schedule.service_closure?.status === 'priced'
                    ? formatPaymentInput(schedule.service_closure.amount)
                    : paymentAmount
                }
                editable={false}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={colors.mutedText}
                style={[styles.paymentInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
              />
            </View>
            {schedule.local_payment?.received ? (
              <TextMuted>Pagamento marcado no agendamento. Este valor não foi lançado no caixa.</TextMuted>
            ) : null}
            <Button
              onPress={handleRecordPayment}
              loading={paymentLoading}
              disabled={schedule.service_closure?.status !== 'priced' || schedule.local_payment?.received}
            >
              {schedule.local_payment?.received ? 'Atualizar valor pago' : 'Marcar pago no local'}
            </Button>
          </Card>

          <Card>
            <PanelHeader title="Fotos do atendimento" detail={`${images.length}/4 fotos anexadas`} />
            <View style={styles.quickActions}>
              <IconAction icon="photo-camera" label={imageLoading ? 'Enviando' : 'Câmera'} onPress={() => handlePickImage('camera')} disabled={imageLoading || images.length >= 4} />
              <IconAction icon="photo-library" label="Galeria" onPress={() => handlePickImage('library')} disabled={imageLoading || images.length >= 4} />
            </View>
            {images.length > 0 ? (
              <View style={styles.imageGrid}>
                {images.map((image) => (
                  <View key={image.id} style={[styles.imageTile, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Ampliar foto do atendimento"
                      onPress={() => setSelectedImageUrl(getScheduleImageUrl(baseUrl, image.schedule_id, image.filename))}
                      style={({ pressed }) => [styles.imagePreviewButton, pressed && styles.pressed]}>
                      <Image source={{ uri: getScheduleImageUrl(baseUrl, image.schedule_id, image.filename) }} style={styles.scheduleImage} resizeMode="cover" />
                      <View style={styles.zoomImageBadge}>
                        <MaterialIcons name="zoom-in" size={18} color="#ffffff" />
                      </View>
                    </Pressable>
                    <Pressable
                      disabled={imageLoading}
                      accessibilityRole="button"
                      accessibilityLabel="Remover foto do atendimento"
                      onPress={() => confirmDeleteImage(image)}
                      style={({ pressed }) => [styles.deleteImageButton, pressed && styles.pressed]}>
                      <MaterialIcons name="delete" size={18} color="#ffffff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <TextMuted>Nenhuma foto anexada.</TextMuted>
            )}
          </Card>

          {selectedImageUrl ? <ZoomableImageModal uri={selectedImageUrl} onClose={() => setSelectedImageUrl(null)} /> : null}

        </>
      ) : (
        <View style={[styles.loadingState, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {loading ? <ActivityIndicator color={colors.tint} /> : <MaterialIcons name="error-outline" size={28} color={colors.icon} />}
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>
            {loading ? 'Carregando atendimento...' : 'Atendimento não encontrado.'}
          </Text>
        </View>
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

function LabeledTextArea({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={styles.inputField}>
      <Text style={[styles.inputLabel, { color: colors.mutedText }]}>{label}</Text>
      <TextInput
        multiline
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedText}
        style={[styles.notesInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.text }]}
      />
    </View>
  );
}

function nextActionText(canCheckIn: boolean, canCheckOut: boolean) {
  if (canCheckIn) return 'Próxima ação: registrar chegada ao cliente.';
  if (canCheckOut) return 'Próxima ação: finalizar atendimento no local.';

  return 'Atendimento sem ação pendente.';
}

function nextActionTitle(canCheckIn: boolean, canCheckOut: boolean) {
  if (canCheckIn) return 'Registrar chegada ao cliente';
  if (canCheckOut) return 'Finalizar atendimento no local';

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

function ZoomableImageModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translationX = useSharedValue(0);
  const translationY = useSharedValue(0);
  const savedTranslationX = useSharedValue(0);
  const savedTranslationY = useSharedValue(0);

  const resetZoom = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    translationX.value = withTiming(0);
    translationY.value = withTiming(0);
    savedTranslationX.value = 0;
    savedTranslationY.value = 0;
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(4, Math.max(1, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;

      if (scale.value <= 1) {
        resetZoom();
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value <= 1) return;

      translationX.value = savedTranslationX.value + event.translationX;
      translationY.value = savedTranslationY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslationX.value = translationX.value;
      savedTranslationY.value = translationY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        resetZoom();
        return;
      }

      scale.value = withTiming(2);
      savedScale.value = 2;
    });

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translationX.value },
      { translateY: translationY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.imageModal}>
        <View style={styles.imageModalHeader}>
          <Text style={styles.imageModalHint}>Use dois dedos ou toque duas vezes para ampliar</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar imagem ampliada"
            onPress={onClose}
            style={({ pressed }) => [styles.imageModalClose, pressed && styles.pressed]}>
            <MaterialIcons name="close" size={26} color="#ffffff" />
          </Pressable>
        </View>
        <GestureDetector gesture={Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture)}>
          <Animated.View style={[styles.zoomableImageFrame, { width, height: height * 0.78 }, imageStyle]}>
            <Image source={{ uri }} style={styles.zoomableImage} resizeMode="contain" />
          </Animated.View>
        </GestureDetector>
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
    throw new ApiError('Permita o acesso a camera para anexar fotos.', 422);
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
    throw new ApiError('Permita o acesso a galeria para anexar fotos.', 422);
  }

  return ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    base64: true,
    mediaTypes: ['images'],
    quality: 0.72,
  });
}

function getScheduleImageUrl(baseUrl: string, scheduleId: number, filename: string) {
  const serverUrl = baseUrl.replace(/\/api\/?$/, '');

  return `${serverUrl}/storage/schedules/${scheduleId}/${filename}`;
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

function normalizeMaterialChecklist(items: TechnicianSchedule['material_checklist']): ScheduleMaterialChecklistItem[] {
  if (!Array.isArray(items)) return [];

  return items.flatMap((item) => {
    const name = String(item?.name ?? '').trim();
    const quantity = Math.max(1, Number(item?.quantity ?? 1) || 1);

    return name ? [{ name, quantity, part_id: item?.part_id ?? null, used: Boolean(item?.used) }] : [];
  });
}

function materialChecklistDetail(items: ScheduleMaterialChecklistItem[]) {
  if (items.length === 0) return 'Pecas e materiais separados para o atendimento';

  const used = items.filter((item) => item.used).length;

  return `${used}/${items.length} materiais usados`;
}

function normalizeEquipmentChecklist(schedule: TechnicianSchedule | null) {
  const availableItems = schedule?.order?.equipment?.checklist_items;
  const completedItems = new Set(schedule?.order?.technician_checklist_items ?? []);

  if (!Array.isArray(availableItems)) return [];

  return availableItems
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .map((label) => ({
      label,
      completed: completedItems.has(label),
    }));
}

function equipmentChecklistDetail(items: { label: string; completed: boolean }[]) {
  if (items.length === 0) return 'Checklist cadastrado no equipamento da OS';

  const completed = items.filter((item) => item.completed).length;

  return `${completed}/${items.length} itens concluidos`;
}

function formatPaymentInput(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '';

  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) return '';

  return formatDecimalCurrency(amount);
}

function formatCurrency(value: string | number | null | undefined) {
  const amount = Number(value || 0);

  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDecimalCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeText(value: string) {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

const styles = StyleSheet.create({
  pageHeader: {
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    borderRadius: 12,
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
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionSummaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
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
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
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
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  inputField: {
    gap: 7,
  },
  inputLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  actions: {
    gap: 10,
  },
  materialList: {
    gap: 10,
  },
  materialItem: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  materialText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentCurrencyIcon: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  paymentInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    lineHeight: 22,
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
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imagePreviewButton: {
    flex: 1,
  },
  scheduleImage: {
    width: '100%',
    height: '100%',
  },
  zoomImageBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 36, 0.74)',
  },
  deleteImageButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 36, 0.74)',
  },
  imageModal: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
    overflow: 'hidden',
  },
  imageModalHeader: {
    position: 'absolute',
    zIndex: 2,
    top: 46,
    right: 18,
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  imageModalHint: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  imageModalClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  zoomableImageFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomableImage: {
    width: '100%',
    height: '100%',
  },
  loadingState: {
    minHeight: 180,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
});
