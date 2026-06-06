import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  notifyNewTechnicianSchedulesLocally,
  rememberTechnicianSchedulesForLocalNotifications,
} from '@/lib/push-notifications';
import { useSession } from '@/lib/session-context';

type AgendaPeriod = 'pending' | 'today' | 'overdue' | 'completed';

const LOCAL_NOTIFICATION_POLL_INTERVAL_MS = 30_000;

type CachedHomeData = {
  dashboard: TechnicianDashboard;
  schedules: TechnicianSchedule[];
  savedAt: string;
};

type CachedScheduleData = {
  schedule: TechnicianSchedule;
  savedAt?: string;
};

type PendingOfflineItem = {
  scheduleId: number;
  title: string;
  detail: string;
  savedAt?: string;
};

type ScheduleSection = 'images' | 'report';

const agendaFilters: { label: string; value: AgendaPeriod }[] = [
  { label: 'Pendentes', value: 'pending' },
  { label: 'Hoje', value: 'today' },
  { label: 'Atrasados', value: 'overdue' },
  { label: 'Concluídos', value: 'completed' },
];

export default function AtendimentoScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const { baseUrl, session, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const [dashboard, setDashboard] = useState<TechnicianDashboard | null>(null);
  const [schedules, setSchedules] = useState<TechnicianSchedule[]>([]);
  const [agendaPeriod, setAgendaPeriod] = useState<AgendaPeriod>('pending');
  const [selectedSchedule, setSelectedSchedule] = useState<TechnicianSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);
  const [pendingOfflineItems, setPendingOfflineItems] = useState<PendingOfflineItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const localNotificationHistoryReady = useRef(false);

  const token = session?.accessToken;
  const tenantId = session?.user.tenant_id;

  const loadData = useCallback(async () => {
    if (!token || !tenantId) return;

    setLoading(true);
    setMessage(null);
    setPendingOfflineItems(await getPendingOfflineItems(tenantId));
    const cacheKey = getHomeCacheKey(tenantId, agendaPeriod);
    const cachedData = await readCache<CachedHomeData>(cacheKey);

    if (cachedData) {
      setDashboard(cachedData.dashboard);
      setSchedules(cachedData.schedules);
    }

    try {
      const [dashboardResponse, schedulesResponse] = await Promise.all([
        getTechnicianDashboard(baseUrl, token),
        getTechnicianSchedules(baseUrl, token, { period: agendaPeriod, per_page: 10 }),
      ]);
      const nextSchedules = schedulesResponse.data ?? [];

      setDashboard(dashboardResponse);
      setSchedules(nextSchedules);

      if (agendaPeriod === 'pending') {
        if (localNotificationHistoryReady.current) {
          await notifyNewTechnicianSchedulesLocally(nextSchedules);
        } else {
          await rememberTechnicianSchedulesForLocalNotifications(nextSchedules);
          localNotificationHistoryReady.current = true;
        }
      }

      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          dashboard: dashboardResponse,
          schedules: nextSchedules,
          savedAt: new Date().toISOString(),
        }),
      );
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : cachedData ? 'Sem conexão. Exibindo agenda salva.' : 'Não foi possível carregar os atendimentos.');
    } finally {
      setLoading(false);
    }
  }, [agendaPeriod, baseUrl, tenantId, token]);

  useEffect(() => {
    if (!token || !tenantId) return;

    const accessToken = token;
    let isMounted = true;

    async function pollPendingSchedules() {
      try {
        const response = await getTechnicianSchedules(baseUrl, accessToken, { period: 'pending', per_page: 20 });
        const pendingSchedules = response.data ?? [];

        if (!isMounted) return;

        if (localNotificationHistoryReady.current) {
          await notifyNewTechnicianSchedulesLocally(pendingSchedules);
        } else {
          await rememberTechnicianSchedulesForLocalNotifications(pendingSchedules);
          localNotificationHistoryReady.current = true;
        }
      } catch (error) {
        console.warn('Nao foi possivel verificar novos agendamentos para notificacao local.', error);
      }
    }

    pollPendingSchedules();
    const interval = setInterval(pollPendingSchedules, LOCAL_NOTIFICATION_POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [baseUrl, tenantId, token]);

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
      setMessage(error instanceof ApiError ? error.message : 'Não foi possível atualizar o status.');
    } finally {
      setStatusLoadingId(null);
    }
  }

  const openScheduleSection = useCallback(
    (schedule: TechnicianSchedule, section: ScheduleSection) => {
      router.push(`/agendamentos/${schedule.id}?section=${section}` as never);
    },
    [router],
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
  const primaryScheduleTitle = currentSchedule ? 'Atendimento em andamento' : 'Próximo atendimento';

  return (
    <AppShell>
      <View style={[styles.workspaceHeader, { backgroundColor: colors.accent, paddingTop: Math.max(18, insets.top + 12) }]}>
        <View style={styles.headerActions}>
          <View style={styles.headerActionGroup}>
            <View style={styles.headerUserIcon}>
              <MaterialIcons name="account-circle" size={24} color="#ffffff" />
            </View>
          </View>
          <View style={[styles.headerActionGroup, styles.headerActionGroupRight]}>
            <Pressable
              disabled={loading}
              onPress={loadData}
              style={({ pressed }) => [styles.headerIconButton, { opacity: loading ? 0.58 : pressed ? 0.72 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Atualizar agenda">
              <MaterialIcons name={loading ? 'sync' : 'refresh'} size={21} color="#ffffff" />
            </Pressable>
            <Pressable
              onPress={signOut}
              style={({ pressed }) => [styles.headerIconButton, { opacity: pressed ? 0.72 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Sair">
              <MaterialIcons name="logout" size={21} color="#ffffff" />
            </Pressable>
          </View>
        </View>
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
          </View>
        </View>
      </View>

      {message ? <Message tone="error">{message}</Message> : null}

      <View style={styles.summaryGrid}>
        <SummaryCard label="Hoje" value={dashboard?.summary.today ?? 0} icon="today" tone="primary" />
        <SummaryCard label="Pendentes" value={dashboard?.summary.pending ?? 0} icon="pending-actions" tone="warning" />
        <SummaryCard label="Em atendimento" value={dashboard?.summary.in_progress ?? 0} icon="engineering" tone="success" />
        <SummaryCard label="Atrasados" value={dashboard?.summary.overdue ?? 0} icon="priority-high" tone="danger" />
      </View>

      {pendingOfflineItems.length > 0 ? (
        <Card>
          <PanelHeader
            title="Sincronização pendente"
            detail={
              pendingOfflineItems.length === 1
                ? '1 atendimento com alterações offline'
                : `${pendingOfflineItems.length} atendimentos com alterações offline`
            }
          />
          <View style={styles.pendingOfflineList}>
            {pendingOfflineItems.slice(0, 3).map((item) => (
              <Pressable
                key={item.scheduleId}
                onPress={() => router.push(`/agendamentos/${item.scheduleId}` as never)}
                style={({ pressed }) => [styles.pendingOfflineItem, { backgroundColor: colors.muted, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}>
                <View style={[styles.pendingOfflineIcon, { backgroundColor: `${colors.tint}18` }]}>
                  <MaterialIcons name="sync-problem" size={19} color={colors.tint} />
                </View>
                <View style={styles.pendingOfflineText}>
                  <Text style={[styles.pendingOfflineTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.pendingOfflineDetail, { color: colors.mutedText }]} numberOfLines={1}>
                    {item.detail}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color={colors.icon} />
              </Pressable>
            ))}
            {pendingOfflineItems.length > 3 ? (
              <Text style={[styles.pendingOfflineMore, { color: colors.mutedText }]}>
                {pendingOfflineMoreText(pendingOfflineItems.length - 3)}
              </Text>
            ) : null}
          </View>
        </Card>
      ) : null}

      <Card>
        <PanelHeader title={primaryScheduleTitle} detail={nextSchedule ? primaryScheduleDetail(nextSchedule, currentSchedule) : 'Sem agenda pendente'} />
        {nextSchedule ? (
          <ScheduleCard
            schedule={nextSchedule}
            featured
            loading={statusLoadingId === nextSchedule.id}
            onOpen={() => setSelectedSchedule(nextSchedule)}
            onOpenSection={openScheduleSection}
            onUpdateStatus={updateScheduleStatus}
          />
        ) : (
          <EmptyState icon="event-available" title="Nenhum atendimento pendente" detail="Quando uma agenda for enviada ao técnico, ela aparece aqui." />
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
                onOpenSection={openScheduleSection}
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
  tone: 'primary' | 'warning' | 'success' | 'danger';
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const toneColor = tone === 'primary' ? colors.tint : tone === 'success' ? colors.success : tone === 'danger' ? '#b42318' : '#a05a00';

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
  onOpenSection,
  onUpdateStatus,
}: {
  schedule: TechnicianSchedule;
  featured?: boolean;
  loading?: boolean;
  onOpen: () => void;
  onOpenSection: (schedule: TechnicianSchedule, section: ScheduleSection) => void;
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
                {schedule.customer?.name ?? 'Cliente não informado'}
              </Text>
            </View>
            <StatusPill label={schedule.technician_status_label ?? schedule.status_label ?? 'Agendado'} status={schedule.status} />
          </View>

          <Text style={[styles.summaryText, { color: colors.text }]} numberOfLines={2}>
            {schedule.service ?? 'Serviço não informado'}
          </Text>
          <Text style={[styles.summaryMeta, { color: colors.mutedText }]} numberOfLines={1}>
            {schedule.order ? `OS ${schedule.order.order_number}` : 'Sem OS'} · {formatEquipment(schedule)}
          </Text>

          {schedule.order ? <ScheduleBadges schedule={schedule} onOpenSection={onOpenSection} /> : null}

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

function ScheduleBadges({
  schedule,
  onOpenSection,
}: {
  schedule: TechnicianSchedule;
  onOpenSection: (schedule: TechnicianSchedule, section: ScheduleSection) => void;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const mobileSummary = schedule.order?.mobile_summary;
  const imagesCount = mobileSummary?.images_count ?? 0;
  const hasReport = Boolean(mobileSummary?.has_technician_notes || schedule.order?.technician_diagnosis || schedule.order?.technician_solution);

  return (
    <View style={styles.scheduleBadges}>
      <Pressable
        onPress={() => onOpenSection(schedule, 'images')}
        style={({ pressed }) => [
          styles.scheduleBadge,
          { backgroundColor: colors.muted, borderColor: colors.border, opacity: pressed ? 0.72 : 1 },
        ]}>
        <MaterialIcons name="photo-library" size={16} color={colors.tint} />
        <Text style={[styles.scheduleBadgeText, { color: colors.text }]}>Fotos {imagesCount}</Text>
      </Pressable>
      <Pressable
        onPress={() => onOpenSection(schedule, 'report')}
        style={({ pressed }) => [
          styles.scheduleBadge,
          { backgroundColor: colors.muted, borderColor: colors.border, opacity: pressed ? 0.72 : 1 },
        ]}>
        <MaterialIcons name={hasReport ? 'assignment-turned-in' : 'assignment'} size={16} color={hasReport ? colors.success : colors.tint} />
        <Text style={[styles.scheduleBadgeText, { color: colors.text }]}>{hasReport ? 'Relatório salvo' : 'Relatório'}</Text>
      </Pressable>
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
                {schedule.customer?.name ?? 'Cliente não informado'}
              </Text>
            </View>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.modalCloseButton, { backgroundColor: colors.muted }, pressed && styles.pressed]}>
              <MaterialIcons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.modalInfo}>
            <DataItem icon="today" label="Horário" value={formatShortDateTime(schedule.schedules)} />
            <DataItem icon="build" label="Serviço" value={schedule.service ?? 'Não informado'} />
            <DataItem icon="confirmation-number" label="OS" value={schedule.order ? String(schedule.order.order_number) : 'Sem OS'} />
            <DataItem icon="precision-manufacturing" label="Equipamento" value={formatEquipment(schedule)} />
            {address ? <DataItem icon="place" label="Endereço" value={address} wide /> : null}
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
  headerActionGroup: {
    minWidth: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionGroupRight: {
    justifyContent: 'flex-end',
  },
  headerUserIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    width: 38,
    height: 38,
    borderRadius: 8,
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
  pendingOfflineList: {
    gap: 10,
  },
  pendingOfflineItem: {
    minHeight: 62,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pendingOfflineIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingOfflineText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pendingOfflineTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
  },
  pendingOfflineDetail: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  pendingOfflineMore: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
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
  scheduleBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scheduleBadge: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scheduleBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
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
  if (period === 'overdue') return 'Atendimentos atrasados';
  if (period === 'completed') return 'Atendimentos concluídos';

  return 'Agenda pendente';
}

function agendaDetail(period: AgendaPeriod, total: number) {
  const suffix = total === 1 ? '1 registro' : `${total} registros`;

  if (period === 'today') return `${suffix} programados para hoje`;
  if (period === 'overdue') return `${suffix} com prazo vencido`;
  if (period === 'completed') return `${suffix} finalizados`;

  return `${suffix} aguardando execução`;
}

function emptyAgendaDetail(period: AgendaPeriod) {
  if (period === 'today') return 'Não há atendimentos programados para hoje.';
  if (period === 'overdue') return 'Não há atendimentos atrasados.';
  if (period === 'completed') return 'Nenhum atendimento concluído encontrado.';

  return 'Não há agendamentos pendentes para este técnico.';
}

function primaryScheduleDetail(schedule: TechnicianSchedule, currentSchedule: TechnicianSchedule | null) {
  if (currentSchedule?.id === schedule.id) return 'Continue o atendimento iniciado';

  return formatShortDateTime(schedule.schedules);
}

function pendingOfflineMoreText(total: number) {
  if (total === 1) return '+1 atendimento aguardando sincronização';

  return `+${total} atendimentos aguardando sincronização`;
}

function formatEquipment(schedule: TechnicianSchedule) {
  const equipment = schedule.order?.equipment?.equipment;
  const model = schedule.order?.model;

  return [equipment, model].filter(Boolean).join(' - ') || 'Não informado';
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

function getHomeCacheKey(tenantId: number, period: AgendaPeriod) {
  return `@VetorTecnico:home:${tenantId}:${period}`;
}

async function getPendingOfflineItems(tenantId: number): Promise<PendingOfflineItem[]> {
  const keys = await AsyncStorage.getAllKeys();
  const prefix = getPendingSchedulePrefix(tenantId);
  const pendingKeys = keys.filter((key) => key.startsWith(prefix));
  const items = await Promise.all(
    pendingKeys.map(async (key): Promise<PendingOfflineItem | null> => {
      const scheduleId = Number(key.replace(prefix, ''));

      if (!Number.isFinite(scheduleId)) return null;

      const pending = await readCache<{ savedAt?: string }>(key);
      const cachedSchedule = await readCache<CachedScheduleData>(getScheduleCacheKey(tenantId, scheduleId));
      const schedule = cachedSchedule?.schedule;

      return {
        scheduleId,
        title: schedule ? `Agenda #${schedule.schedules_number}` : `Agenda ${scheduleId}`,
        detail: schedule?.customer?.name ?? 'Atendimento aguardando sincronização',
        savedAt: pending?.savedAt,
      };
    }),
  );

  return items
    .filter((item): item is PendingOfflineItem => Boolean(item))
    .sort((first, second) => (second.savedAt ?? '').localeCompare(first.savedAt ?? ''));
}

function getPendingSchedulePrefix(tenantId: number) {
  return `@VetorTecnico:pending-schedule:${tenantId}:`;
}

function getScheduleCacheKey(tenantId: number, scheduleId: number) {
  return `@VetorTecnico:schedule:${tenantId}:${scheduleId}`;
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
