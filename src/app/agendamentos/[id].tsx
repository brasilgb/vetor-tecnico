import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { Button, Card, Message, TextMuted, Title } from '@/components/ui-kit';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  ApiError,
  checkInTechnicianSchedule,
  checkOutTechnicianSchedule,
  getTechnicianSchedule,
  TechnicianSchedule,
} from '@/lib/api';
import { useSession } from '@/lib/session-context';

type ActionKind = 'check-in' | 'check-out';

export default function ScheduleDetailScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { baseUrl, session } = useSession();
  const [schedule, setSchedule] = useState<TechnicianSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<ActionKind | null>(null);
  const [observations, setObservations] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const token = session?.accessToken;
  const scheduleId = Number(params.id);

  const loadSchedule = useCallback(async () => {
    if (!token || !Number.isFinite(scheduleId)) return;

    setLoading(true);
    setMessage(null);

    try {
      setSchedule(await getTechnicianSchedule(baseUrl, token, scheduleId));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel carregar o atendimento.');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, scheduleId, token]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const address = useMemo(() => formatAddress(schedule), [schedule]);
  const mapsUrl = useMemo(() => getMapsUrl(address), [address]);
  const canCheckIn = Boolean(schedule && schedule.status !== 3 && !schedule.check_in?.at);
  const canCheckOut = Boolean(schedule && schedule.status !== 3 && schedule.check_in?.at && !schedule.check_out?.at);

  async function handleAttendanceAction(kind: ActionKind) {
    if (!token || !schedule) return;

    setActionLoading(kind);
    setMessage(null);

    try {
      const payload = observations.trim() ? { observations: observations.trim() } : {};
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
        <Pressable onPress={loadSchedule} style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
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
              <StatusPill label={schedule.status_label ?? 'Agendado'} status={schedule.status} />
            </View>

            <View style={styles.infoGrid}>
              <InfoRow icon="build" label="Servico" value={schedule.service ?? schedule.details ?? 'Servico nao informado'} />
              <InfoRow icon="place" label="Endereco" value={address ?? 'Endereco nao informado'} />
              <InfoRow icon="phone" label="Telefone" value={schedule.customer?.phone ?? 'Nao informado'} />
              <InfoRow icon="chat" label="WhatsApp" value={schedule.customer?.whatsapp ?? 'Nao informado'} />
            </View>

            <View style={styles.quickActions}>
              {mapsUrl ? <IconAction icon="route" label="Abrir rota" onPress={() => Linking.openURL(mapsUrl)} /> : null}
              {schedule.customer?.phone ? <IconAction icon="call" label="Ligar" onPress={() => Linking.openURL(`tel:${schedule.customer?.phone ?? ''}`)} /> : null}
              {schedule.customer?.whatsapp ? <IconAction icon="chat" label="WhatsApp" onPress={() => openWhatsApp(schedule.customer?.whatsapp ?? '')} /> : null}
            </View>
          </Card>

          <Card>
            <PanelHeader title="Execucao do atendimento" detail={nextActionText(canCheckIn, canCheckOut)} />
            <View style={styles.timeline}>
              <TimelineItem label="Check-in" value={formatOptionalDateTime(schedule.check_in?.at)} done={Boolean(schedule.check_in?.at)} />
              <TimelineItem label="Check-out" value={formatOptionalDateTime(schedule.check_out?.at)} done={Boolean(schedule.check_out?.at)} />
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

function IconAction({ icon, label, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void }) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconAction, { borderColor: colors.border, backgroundColor: colors.muted }, pressed && styles.pressed]}>
      <MaterialIcons name={icon} size={18} color={colors.text} />
      <Text style={[styles.iconActionText, { color: colors.text }]}>{label}</Text>
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

const styles = StyleSheet.create({
  pageHeader: {
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconAction: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconActionText: {
    fontSize: 13,
    fontWeight: '900',
  },
  timeline: {
    gap: 10,
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
  pressed: {
    opacity: 0.72,
  },
});
