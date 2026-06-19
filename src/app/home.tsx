import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

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
  const [message, setMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const token = session?.accessToken;

  const loadData = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setMessage(null);

    const [dashboardResult, schedulesResult] = await Promise.allSettled([
      getTechnicianDashboard(baseUrl, token),
      getTechnicianSchedules(baseUrl, token, { period: agendaPeriod, per_page: 10 }),
    ]);

    if (dashboardResult.status === 'fulfilled') {
      setDashboard(dashboardResult.value);
    }

    if (schedulesResult.status === 'fulfilled') {
      setSchedules(sortSchedulesForPeriod(schedulesResult.value.data ?? [], agendaPeriod));
    }

    if (dashboardResult.status === 'fulfilled' || schedulesResult.status === 'fulfilled') {
      setLastUpdatedAt(new Date());
    }

    if (dashboardResult.status === 'rejected' && schedulesResult.status === 'rejected') {
      setMessage(getApiErrorMessage(dashboardResult.reason, 'Nao foi possivel carregar os atendimentos.'));
    } else if (dashboardResult.status === 'rejected') {
      setMessage(getApiErrorMessage(dashboardResult.reason, 'Agenda atualizada, mas nao foi possivel atualizar o resumo.'));
    } else if (schedulesResult.status === 'rejected') {
      setMessage(getApiErrorMessage(schedulesResult.reason, 'Resumo atualizado, mas nao foi possivel atualizar a agenda.'));
    }

    setLoading(false);
  }, [agendaPeriod, baseUrl, token]);

  const refreshData = useCallback(() => {
    void loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData]),
  );

  if (!session) {
    return (
      <AppShell>
        <TextMuted>Entre no app para acessar o atendimento.</TextMuted>
      </AppShell>
    );
  }

  const currentSchedule = dashboard?.current_schedule ?? schedules.find((schedule) => schedule.status === 2) ?? null;
  const nextSchedule = currentSchedule ?? dashboard?.next_schedule ?? (agendaPeriod === 'pending' ? schedules[0] : null);
  const visibleSchedules = nextSchedule ? schedules.filter((schedule) => schedule.id !== nextSchedule.id) : schedules;
  const lastUpdatedLabel = lastUpdatedAt ? `Atualizado às ${formatClock(lastUpdatedAt)}` : 'Aguardando atualização';

  return (
    <AppShell>
      <View style={[styles.workspaceHeader, { backgroundColor: colors.accent }]}>
        <Pressable
          disabled={loading}
          hitSlop={10}
          onPress={refreshData}
          style={({ pressed }) => [styles.headerIconButton, { opacity: loading ? 0.58 : pressed ? 0.72 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Atualizar agenda">
          {loading ? <ActivityIndicator size="small" color="#ffffff" /> : <MaterialIcons name="refresh" size={22} color="#ffffff" />}
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
            <Text style={styles.eyebrow}>Operação técnica</Text>
            <Text style={styles.companyName} numberOfLines={2}>
              {session.company?.name || 'VetorOS'}
            </Text>
            <Text style={styles.operatorName}>{session.user.name}</Text>
            <Text style={styles.lastUpdatedText}>{lastUpdatedLabel}</Text>
          </View>
        </View>
      </View>

      {message ? <Message tone="error">{message}</Message> : null}

      {loading && !dashboard && schedules.length === 0 ? (
        <LoadingState label="Carregando sua agenda..." />
      ) : (
        <>
          <View style={styles.summaryGrid}>
            <SummaryCard label="Hoje" value={dashboard?.summary.today ?? 0} icon="today" tone="primary" />
            <SummaryCard label="Pendentes" value={dashboard?.summary.pending ?? 0} icon="pending-actions" tone="warning" />
          </View>

          <Card>
            <PanelHeader
              title={currentSchedule ? 'Atendimento em andamento' : 'Próximo atendimento'}
              detail={nextSchedule ? formatShortDateTime(nextSchedule.schedules) : 'Sem agenda pendente'}
            />
            {nextSchedule ? (
              <ScheduleCard
                schedule={nextSchedule}
                featured
                onOpen={() => setSelectedSchedule(nextSchedule)}
              />
            ) : (
              <EmptyState icon="event-available" title="Nenhum atendimento pendente" detail="Quando uma agenda for enviada ao técnico, ela aparecerá aqui." />
            )}
          </Card>

          <Card>
            <PanelHeader title={agendaTitle(agendaPeriod)} detail={agendaDetail(agendaPeriod, visibleSchedules.length)} />
            <View style={styles.filterRow}>
              {agendaFilters.map((filter) => (
                <Pressable
                  key={filter.value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: agendaPeriod === filter.value }}
                  onPress={() => setAgendaPeriod(filter.value)}
                  style={({ pressed }) => [
                    styles.filterButton,
                    {
                      backgroundColor: agendaPeriod === filter.value ? colors.tint : colors.muted,
                      borderColor: agendaPeriod === filter.value ? colors.tint : colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}>
                  <Text style={[styles.filterText, { color: agendaPeriod === filter.value ? colors.tintText : colors.text }]}>{filter.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.scheduleList}>
              {visibleSchedules.length > 0 ? (
                visibleSchedules.map((schedule) => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    onOpen={() => setSelectedSchedule(schedule)}
                  />
                ))
              ) : (
                <EmptyState icon="assignment" title="Nenhum outro registro" detail={emptyAgendaDetail(agendaPeriod)} />
              )}
            </View>
          </Card>
        </>
      )}

      <ScheduleDetailsModal
        schedule={selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
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
  onOpen,
}: {
  schedule: TechnicianSchedule;
  featured?: boolean;
  onOpen: () => void;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];

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
            {formatScheduleSummary(schedule)}
          </Text>

          <View style={styles.scheduleActions}>
            <ActionButton icon="visibility" label="Detalhes" onPress={onOpen} primary />
          </View>
        </View>
      </View>
    </View>
  );
}

function ScheduleDetailsModal({
  schedule,
  onClose,
  onOpenFull,
}: {
  schedule: TechnicianSchedule | null;
  onClose: () => void;
  onOpenFull: (schedule: TechnicianSchedule) => void;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const insets = useSafeAreaInsets();

  if (!schedule) return null;

  const address = formatAddress(schedule);
  const mapsUrl = schedule.customer?.quick_actions?.maps_url ?? getMapsUrl(address);

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
            <DataItem icon="notes" label="Detalhes" value={schedule.details ?? 'Nao informado'} />
            {address ? <DataItem icon="place" label="Endereco" value={address} wide /> : null}
          </View>

          <View style={styles.scheduleActions}>
            {mapsUrl ? <ActionButton icon="route" label="Rota" onPress={() => Linking.openURL(mapsUrl)} /> : null}
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
          backgroundColor: primary ? colors.tint : colors.muted,
          borderColor: primary ? colors.tint : colors.border,
          opacity: disabled ? 0.58 : pressed ? 0.75 : 1,
        },
      ]}>
      <MaterialIcons name={icon} size={18} color={primary ? colors.tintText : colors.text} />
      <Text style={[styles.actionText, { color: primary ? colors.tintText : colors.text }]} numberOfLines={1}>
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

function LoadingState({ label }: { label: string }) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={[styles.loadingState, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ActivityIndicator color={colors.tint} />
      <Text style={[styles.loadingText, { color: colors.mutedText }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  workspaceHeader: {
    borderRadius: 16,
    padding: 20,
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
    borderRadius: 14,
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
    paddingRight: 90,
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
  lastUpdatedText: {
    marginTop: 4,
    color: 'rgba(255, 255, 255, 0.74)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  headerIconButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
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
    flexGrow: 1,
    flexBasis: 92,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
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
    borderRadius: 16,
    padding: 16,
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
    borderRadius: 12,
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
    borderRadius: 12,
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
    borderRadius: 16,
    padding: 20,
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
  loadingState: {
    minHeight: 132,
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 36, 0.48)',
  },
  modalSheet: {
    width: '100%',
    maxHeight: '86%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#44516a',
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
    borderRadius: 12,
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
  if (period === 'completed') return 'Atendimentos concluídos';

  return 'Agenda pendente';
}

function agendaDetail(period: AgendaPeriod, total: number) {
  const suffix = total === 1 ? '1 registro' : `${total} registros`;

  if (period === 'today') return `${suffix} programados para hoje`;
  if (period === 'completed') return `${suffix} finalizados`;

  return `${suffix} aguardando execução`;
}

function emptyAgendaDetail(period: AgendaPeriod) {
  if (period === 'today') return 'Não há outros atendimentos programados para hoje.';
  if (period === 'completed') return 'Nenhum atendimento concluído encontrado.';

  return 'Não há outros agendamentos pendentes para este técnico.';
}

function formatScheduleSummary(schedule: TechnicianSchedule) {
  const details = schedule.details?.trim();

  if (details) return details;

  const materials = schedule.material_checklist_labels?.filter(Boolean).join(', ');

  return materials || 'Atendimento externo';
}

function sortSchedulesForPeriod(schedules: TechnicianSchedule[], period: AgendaPeriod) {
  if (period === 'completed') return schedules;

  return [...schedules].sort((left, right) => {
    if (left.status === 2 && right.status !== 2) return -1;
    if (left.status !== 2 && right.status === 2) return 1;

    return (parseDate(left.schedules)?.getTime() ?? 0) - (parseDate(right.schedules)?.getTime() ?? 0);
  });
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

function formatClock(value: Date) {
  return value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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

function getApiErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
