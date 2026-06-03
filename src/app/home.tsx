import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { Card, Message, TextMuted, Title } from '@/components/ui-kit';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ApiError,
  getTechnicianDashboard,
  getTechnicianSchedules,
  TechnicianDashboard,
  TechnicianSchedule,
  updateTechnicianScheduleStatus,
} from '@/lib/api';
import { useSession } from '@/lib/session-context';

type AgendaPeriod = 'pending' | 'today' | 'completed';

const agendaFilters: { label: string; value: AgendaPeriod }[] = [
  { label: 'Pendentes', value: 'pending' },
  { label: 'Hoje', value: 'today' },
  { label: 'Concluidos', value: 'completed' },
];

export default function AtendimentoScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const { baseUrl, session } = useSession();
  const [dashboard, setDashboard] = useState<TechnicianDashboard | null>(null);
  const [schedules, setSchedules] = useState<TechnicianSchedule[]>([]);
  const [agendaPeriod, setAgendaPeriod] = useState<AgendaPeriod>('pending');
  const [selectedSchedule, setSelectedSchedule] = useState<TechnicianSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const token = session?.accessToken;

  const loadData = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setMessage(null);

    try {
      const [dashboardResponse, schedulesResponse] = await Promise.all([
        getTechnicianDashboard(baseUrl, token),
        getTechnicianSchedules(baseUrl, token, { period: agendaPeriod, per_page: 10 }),
      ]);

      setDashboard(dashboardResponse);
      setSchedules(schedulesResponse.data ?? []);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel carregar os atendimentos.');
    } finally {
      setLoading(false);
    }
  }, [agendaPeriod, baseUrl, token]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  async function updateScheduleStatus(schedule: TechnicianSchedule, status: 1 | 2) {
    if (!token) return;

    setStatusLoadingId(schedule.id);
    setMessage(null);

    try {
      const updatedSchedule = await updateTechnicianScheduleStatus(baseUrl, token, schedule.id, { status });

      setSelectedSchedule((current) => (current?.id === updatedSchedule.id ? updatedSchedule : current));
      setSchedules((current) => current.map((item) => (item.id === updatedSchedule.id ? updatedSchedule : item)));
      setDashboard((current) => {
        if (!current?.next_schedule || current.next_schedule.id !== updatedSchedule.id) return current;

        return {
          ...current,
          next_schedule: updatedSchedule,
        };
      });
      await loadData();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel atualizar o status.');
    } finally {
      setStatusLoadingId(null);
    }
  }

  if (!session) {
    return (
      <AppShell>
        <TextMuted>Entre no app para acessar o atendimento.</TextMuted>
      </AppShell>
    );
  }

  const nextSchedule = dashboard?.next_schedule ?? (agendaPeriod === 'pending' ? schedules[0] : null);

  return (
    <AppShell>
      <View style={[styles.workspaceHeader, { backgroundColor: colors.accent }]}>
        <Pressable
          disabled={loading}
          onPress={loadData}
          style={({ pressed }) => [styles.headerIconButton, { opacity: loading ? 0.58 : pressed ? 0.72 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Atualizar agenda">
          <MaterialIcons name={loading ? 'sync' : 'refresh'} size={21} color="#ffffff" />
        </Pressable>
        <View style={styles.companyRow}>
          <View style={styles.companyLogoWrap}>
            <Image
              source={getCompanyLogoSource(session.company?.logo_url ?? session.company?.logo, baseUrl)}
              style={styles.companyLogo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.companyText}>
            <Text style={styles.eyebrow}>Operacao tecnica</Text>
            <Text style={styles.companyName} numberOfLines={2}>
              {session.company?.name || 'VetorOS'}
            </Text>
            <Text style={styles.operatorName}>{session.user.name}</Text>
          </View>
        </View>
      </View>

      {message ? <Message tone="error">{message}</Message> : null}

      <View style={styles.summaryGrid}>
        <SummaryCard label="Hoje" value={dashboard?.summary.today ?? 0} icon="today" tone="primary" />
        <SummaryCard label="Pendentes" value={dashboard?.summary.pending ?? 0} icon="pending-actions" tone="warning" />
      </View>

      <Card>
        <PanelHeader title="Proximo atendimento" detail={nextSchedule ? formatShortDateTime(nextSchedule.schedules) : 'Sem agenda pendente'} />
        {nextSchedule ? (
          <ScheduleCard
            schedule={nextSchedule}
            featured
            loading={statusLoadingId === nextSchedule.id}
            onOpen={() => setSelectedSchedule(nextSchedule)}
            onUpdateStatus={updateScheduleStatus}
          />
        ) : (
          <EmptyState icon="event-available" title="Nenhum atendimento pendente" detail="Quando uma agenda for enviada ao tecnico, ela aparece aqui." />
        )}
      </Card>

      <Card>
        <PanelHeader title={agendaTitle(agendaPeriod)} detail={agendaDetail(agendaPeriod, schedules.length)} />
        <View style={styles.filterRow}>
          {agendaFilters.map((filter) => (
            <Pressable
              key={filter.value}
              onPress={() => setAgendaPeriod(filter.value)}
              style={({ pressed }) => [
                styles.filterButton,
                {
                  backgroundColor: agendaPeriod === filter.value ? colors.accent : colors.muted,
                  borderColor: agendaPeriod === filter.value ? colors.accent : colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              <Text style={[styles.filterText, { color: agendaPeriod === filter.value ? '#ffffff' : colors.text }]}>{filter.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.scheduleList}>
          {schedules.length > 0 ? (
            schedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                loading={statusLoadingId === schedule.id}
                onOpen={() => setSelectedSchedule(schedule)}
                onUpdateStatus={updateScheduleStatus}
              />
            ))
          ) : (
            <EmptyState icon="assignment" title="Nenhum registro" detail={emptyAgendaDetail(agendaPeriod)} />
          )}
        </View>
      </Card>

      <ScheduleDetailsModal
        schedule={selectedSchedule}
        loading={selectedSchedule ? statusLoadingId === selectedSchedule.id : false}
        onClose={() => setSelectedSchedule(null)}
        onUpdateStatus={updateScheduleStatus}
        onOpenFull={(schedule) => {
          setSelectedSchedule(null);
          router.push(`/agendamentos/${schedule.id}` as never);
        }}
      />
    </AppShell>
  );
}

function PanelHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.panelHeader}>
      <View>
        <Title>{title}</Title>
        <TextMuted>{detail}</TextMuted>
      </View>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: keyof typeof MaterialIcons.glyphMap;
  tone: 'primary' | 'warning';
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const toneColor = tone === 'primary' ? colors.tint : '#a05a00';

  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.summaryIcon, { backgroundColor: `${toneColor}18` }]}>
        <MaterialIcons name={icon} size={22} color={toneColor} />
      </View>
      <View>
        <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
        <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>{label}</Text>
      </View>
    </View>
  );
}

function ScheduleCard({
  schedule,
  featured,
  loading,
  onOpen,
  onUpdateStatus,
}: {
  schedule: TechnicianSchedule;
  featured?: boolean;
  loading?: boolean;
  onOpen: () => void;
  onUpdateStatus: (schedule: TechnicianSchedule, status: 1 | 2) => void;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const canUpdateStatus = schedule.available_actions?.can_update_status !== false && schedule.status !== 3;
  const isInService = schedule.status === 2;
  const canRevert = isInService && !schedule.check_in?.at;

  return (
    <View style={[styles.scheduleCard, featured && styles.featuredSchedule, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.scheduleMain}>
        <View style={styles.dateBox}>
          <Text style={styles.dateDay}>{formatDay(schedule.schedules)}</Text>
          <Text style={styles.dateMonth}>{formatMonth(schedule.schedules)}</Text>
          <Text style={styles.dateHour}>{formatHour(schedule.schedules)}</Text>
        </View>

        <View style={styles.scheduleContent}>
          <View style={styles.scheduleHeader}>
            <View style={styles.scheduleTitleWrap}>
              <Text style={[styles.scheduleNumber, { color: colors.mutedText }]}>Agenda #{schedule.schedules_number}</Text>
              <Text style={[styles.scheduleTitle, { color: colors.text }]} numberOfLines={2}>
                {schedule.customer?.name ?? 'Cliente nao informado'}
              </Text>
            </View>
            <StatusPill label={schedule.technician_status_label ?? schedule.status_label ?? 'Agendado'} status={schedule.status} />
          </View>

          <Text style={[styles.summaryText, { color: colors.text }]} numberOfLines={2}>
            {schedule.service ?? 'Servico nao informado'}
          </Text>
          <Text style={[styles.summaryMeta, { color: colors.mutedText }]} numberOfLines={1}>
            {schedule.order ? `OS ${schedule.order.order_number}` : 'Sem OS'} · {formatEquipment(schedule)}
          </Text>

          <View style={styles.scheduleActions}>
            {canUpdateStatus ? (
              <ActionButton
                icon={canRevert ? 'undo' : 'play-circle'}
                label={loading ? 'Enviando' : canRevert ? 'Reverter' : isInService ? 'Em atendimento' : 'Iniciar'}
                disabled={loading || (isInService && !canRevert)}
                onPress={() => onUpdateStatus(schedule, canRevert ? 1 : 2)}
              />
            ) : null}
            <ActionButton icon="visibility" label="Detalhes" onPress={onOpen} primary />
          </View>
        </View>
      </View>
    </View>
  );
}

function ScheduleDetailsModal({
  schedule,
  loading,
  onClose,
  onUpdateStatus,
  onOpenFull,
}: {
  schedule: TechnicianSchedule | null;
  loading: boolean;
  onClose: () => void;
  onUpdateStatus: (schedule: TechnicianSchedule, status: 1 | 2) => void;
  onOpenFull: (schedule: TechnicianSchedule) => void;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();

  if (!schedule) return null;

  const address = formatAddress(schedule);
  const mapsUrl = schedule.customer?.quick_actions?.maps_url ?? getMapsUrl(address);
  const canUpdateStatus = schedule.available_actions?.can_update_status !== false && schedule.status !== 3;
  const isInService = schedule.status === 2;
  const canRevert = isInService && !schedule.check_in?.at;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: Math.max(18, insets.bottom + 18) }]}
          onPress={(event) => event.stopPropagation()}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleWrap}>
              <Text style={[styles.scheduleNumber, { color: colors.mutedText }]}>Agenda #{schedule.schedules_number}</Text>
              <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={2}>
                {schedule.customer?.name ?? 'Cliente nao informado'}
              </Text>
            </View>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.modalCloseButton, { backgroundColor: colors.muted }, pressed && styles.pressed]}>
              <MaterialIcons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.modalInfo}>
            <DataItem icon="today" label="Horario" value={formatShortDateTime(schedule.schedules)} />
            <DataItem icon="build" label="Servico" value={schedule.service ?? 'Nao informado'} />
            <DataItem icon="confirmation-number" label="OS" value={schedule.order ? String(schedule.order.order_number) : 'Sem OS'} />
            <DataItem icon="precision-manufacturing" label="Equipamento" value={formatEquipment(schedule)} />
            {address ? <DataItem icon="place" label="Endereco" value={address} wide /> : null}
          </View>

          <View style={styles.scheduleActions}>
            {mapsUrl ? <ActionButton icon="route" label="Rota" onPress={() => Linking.openURL(mapsUrl)} /> : null}
            {canUpdateStatus ? (
              <ActionButton
                icon={canRevert ? 'undo' : 'play-circle'}
                label={loading ? 'Enviando' : canRevert ? 'Reverter' : isInService ? 'Em atendimento' : 'Iniciar'}
                disabled={loading || (isInService && !canRevert)}
                onPress={() => onUpdateStatus(schedule, canRevert ? 1 : 2)}
              />
            ) : null}
            <ActionButton icon="open-in-new" label="Atendimento" onPress={() => onOpenFull(schedule)} primary />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
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

function DataItem({
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
    <View style={[styles.dataItem, wide && styles.dataItemWide]}>
      <MaterialIcons name={icon} size={17} color={colors.icon} />
      <View style={styles.dataText}>
        <Text style={[styles.dataLabel, { color: colors.mutedText }]}>{label}</Text>
        <Text style={[styles.dataValue, { color: colors.text }]} numberOfLines={wide ? 2 : 1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  primary,
  disabled,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: primary ? colors.accent : colors.muted,
          borderColor: primary ? colors.accent : colors.border,
          opacity: disabled ? 0.58 : pressed ? 0.75 : 1,
        },
      ]}>
      <MaterialIcons name={icon} size={18} color={primary ? '#ffffff' : colors.text} />
      <Text style={[styles.actionText, { color: primary ? '#ffffff' : colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState({ icon, title, detail }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; detail: string }) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={[styles.emptyState, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <MaterialIcons name={icon} size={28} color={colors.icon} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyDetail, { color: colors.mutedText }]}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  workspaceHeader: {
    borderRadius: 8,
    padding: 18,
    gap: 18,
    position: 'relative',
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  companyLogoWrap: {
    width: 54,
    height: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  companyLogo: {
    width: 40,
    height: 40,
  },
  companyText: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: 'rgba(255, 255, 255, 0.74)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  companyName: {
    marginTop: 2,
    color: '#ffffff',
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800',
  },
  operatorName: {
    marginTop: 4,
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  headerIconButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: 150,
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryValue: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
  },
  summaryLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  filterText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  scheduleList: {
    gap: 12,
  },
  scheduleCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
  },
  featuredSchedule: {
    borderLeftWidth: 4,
  },
  scheduleMain: {
    width: '100%',
    alignItems: 'flex-start',
    gap: 12,
  },
  dateBox: {
    alignSelf: 'flex-start',
    minWidth: 104,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#15365f',
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
  },
  summaryMeta: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  dateDay: {
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
  },
  dateMonth: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dateHour: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  scheduleContent: {
    width: '100%',
    alignSelf: 'stretch',
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  scheduleTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  scheduleNumber: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scheduleTitle: {
    marginTop: 3,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
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
  essentialList: {
    gap: 8,
  },
  dataItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  dataItemWide: {
    width: '100%',
  },
  dataText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  dataLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dataValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  scheduleActions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
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
  actionText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '900',
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 18,
    alignItems: 'flex-start',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  emptyDetail: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 36, 0.48)',
  },
  modalSheet: {
    width: '100%',
    maxHeight: '86%',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    padding: 18,
    gap: 14,
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d8e0ea',
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  modalTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInfo: {
    gap: 10,
  },
  pressed: {
    opacity: 0.72,
  },
});

function getCompanyLogoSource(logo: string | null | undefined, baseUrl: string) {
  if (!logo) {
    return require('@/assets/images/logo.png');
  }

  if (/^https?:\/\//i.test(logo)) {
    return { uri: logo };
  }

  const serverUrl = baseUrl.replace(/\/api\/?$/, '');
  const normalizedLogo = logo.replace(/^\/+/, '');
  const path = normalizedLogo.includes('/') ? normalizedLogo : `storage/logos/${normalizedLogo}`;

  return { uri: `${serverUrl}/${path}` };
}

function formatAddress(schedule: TechnicianSchedule) {
  const address = schedule.customer?.address;

  if (!address) return null;

  return [address.street, address.number, address.district, address.city, address.state]
    .filter((item) => item !== undefined && item !== null && String(item).trim().length > 0)
    .join(', ');
}

function getMapsUrl(address: string | null) {
  if (!address) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function agendaTitle(period: AgendaPeriod) {
  if (period === 'today') return 'Agenda de hoje';
  if (period === 'completed') return 'Atendimentos concluidos';

  return 'Agenda pendente';
}

function agendaDetail(period: AgendaPeriod, total: number) {
  const suffix = total === 1 ? '1 registro' : `${total} registros`;

  if (period === 'today') return `${suffix} programados para hoje`;
  if (period === 'completed') return `${suffix} finalizados`;

  return `${suffix} aguardando execucao`;
}

function emptyAgendaDetail(period: AgendaPeriod) {
  if (period === 'today') return 'Nao ha atendimentos programados para hoje.';
  if (period === 'completed') return 'Nenhum atendimento concluido encontrado.';

  return 'Nao ha agendamentos pendentes para este tecnico.';
}

function formatEquipment(schedule: TechnicianSchedule) {
  const equipment = schedule.order?.equipment?.equipment;
  const model = schedule.order?.model;

  return [equipment, model].filter(Boolean).join(' - ') || 'Nao informado';
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDay(value: string) {
  return parseDate(value)?.toLocaleDateString('pt-BR', { day: '2-digit' }) ?? '--';
}

function formatMonth(value: string) {
  return parseDate(value)?.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') ?? '---';
}

function formatHour(value: string) {
  return parseDate(value)?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? '--:--';
}

function formatShortDateTime(value: string) {
  const date = parseDate(value);

  if (!date) return value;

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
