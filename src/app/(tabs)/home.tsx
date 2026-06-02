import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { Button, Card, Message, TextMuted, Title } from '@/components/ui-kit';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  ApiError,
  getTechnicianDashboard,
  getTechnicianSchedules,
  TechnicianDashboard,
  TechnicianSchedule,
  updateTechnicianScheduleStatus,
} from '@/lib/api';
import { useSession } from '@/lib/session-context';

export default function AtendimentoScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const { baseUrl, session, signOut } = useSession();
  const [dashboard, setDashboard] = useState<TechnicianDashboard | null>(null);
  const [schedules, setSchedules] = useState<TechnicianSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const token = session?.accessToken;

  const loadData = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setMessage(null);

    try {
      const [dashboardResponse, schedulesResponse] = await Promise.all([
        getTechnicianDashboard(baseUrl, token),
        getTechnicianSchedules(baseUrl, token, { period: 'pending', per_page: 8 }),
      ]);

      setDashboard(dashboardResponse);
      setSchedules(schedulesResponse.data ?? []);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel carregar os atendimentos.');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleLogout() {
    setLogoutLoading(true);
    await signOut();
    setLogoutLoading(false);
  }

  async function markOnTheWay(schedule: TechnicianSchedule) {
    if (!token) return;

    setStatusLoadingId(schedule.id);
    setMessage(null);

    try {
      await updateTechnicianScheduleStatus(baseUrl, token, schedule.id, {
        technician_status: 'on_the_way',
        observations: 'Tecnico a caminho pelo app.',
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

  const nextSchedule = dashboard?.next_schedule ?? schedules[0] ?? null;

  return (
    <AppShell>
      <Card>
        <View style={styles.companyRow}>
          <View style={styles.companyLogoWrap}>
            <Image
              source={getCompanyLogoSource(session.company?.logo_url ?? session.company?.logo, baseUrl)}
              style={styles.companyLogo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.companyText}>
            <TextMuted>Empresa</TextMuted>
            <Text style={[styles.companyName, { color: colors.text }]} numberOfLines={2}>
              {session.company?.name || 'VetorOS'}
            </Text>
            <TextMuted>{session.user.name}</TextMuted>
          </View>
        </View>
      </Card>

      {message ? <Message tone="error">{message}</Message> : null}

      <View style={styles.summaryGrid}>
        <SummaryCard label="Hoje" value={dashboard?.summary.today ?? 0} icon="today" />
        <SummaryCard label="Pendentes" value={dashboard?.summary.pending ?? 0} icon="pending-actions" />
        <SummaryCard label="Concluidos" value={dashboard?.summary.completed ?? 0} icon="task-alt" />
      </View>

      <Card>
        <View style={styles.sectionHeader}>
          <Title>Proximo atendimento</Title>
          <Pressable onPress={loadData} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <MaterialIcons name="refresh" size={22} color={colors.text} />
          </Pressable>
        </View>
        {nextSchedule ? <ScheduleCard schedule={nextSchedule} featured onMarkOnTheWay={markOnTheWay} loading={statusLoadingId === nextSchedule.id} /> : <TextMuted>Nenhum atendimento pendente encontrado.</TextMuted>}
      </Card>

      <Card>
        <View style={styles.sectionHeader}>
          <Title>Agenda pendente</Title>
          {loading ? <TextMuted>Atualizando...</TextMuted> : null}
        </View>
        <View style={styles.scheduleList}>
          {schedules.length > 0 ? (
            schedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                onMarkOnTheWay={markOnTheWay}
                loading={statusLoadingId === schedule.id}
              />
            ))
          ) : (
            <TextMuted>Nenhum agendamento enviado ao tecnico.</TextMuted>
          )}
        </View>
      </Card>

      <Card>
        <Title>Ações rápidas</Title>
        <View style={styles.actions}>
          <Button onPress={() => router.push('/clientes')}>Cadastrar cliente</Button>
          <Button onPress={() => router.push('/orcamentos')} variant="secondary">
            Ver orçamentos
          </Button>
          <Button onPress={handleLogout} loading={logoutLoading} variant="secondary">
            Sair
          </Button>
        </View>
      </Card>
    </AppShell>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: keyof typeof MaterialIcons.glyphMap }) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <MaterialIcons name={icon} size={22} color={colors.tint} />
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.mutedText }]}>{label}</Text>
    </View>
  );
}

function ScheduleCard({
  schedule,
  featured,
  loading,
  onMarkOnTheWay,
}: {
  schedule: TechnicianSchedule;
  featured?: boolean;
  loading?: boolean;
  onMarkOnTheWay: (schedule: TechnicianSchedule) => void;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const address = formatAddress(schedule);
  const mapsUrl = schedule.customer?.quick_actions?.maps_url;
  const canUpdateStatus = schedule.available_actions?.can_update_status !== false;
  const isOnTheWay = schedule.technician_status === 'on_the_way';

  return (
    <View style={[styles.scheduleCard, featured && styles.featuredSchedule, { borderColor: colors.border }]}>
      <View style={styles.scheduleHeader}>
        <View style={styles.scheduleTitleWrap}>
          <Text style={[styles.scheduleTime, { color: colors.tint }]}>{formatDateTime(schedule.schedules)}</Text>
          <Text style={[styles.scheduleTitle, { color: colors.text }]} numberOfLines={2}>
            {schedule.customer?.name ?? 'Cliente nao informado'}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: colors.muted }]}>
          <Text style={[styles.statusText, { color: colors.text }]} numberOfLines={1}>
            {schedule.technician_status_label ?? schedule.status_label ?? 'Agendado'}
          </Text>
        </View>
      </View>

      {schedule.service ? <TextMuted>{schedule.service}</TextMuted> : null}
      {schedule.order ? (
        <Text style={[styles.orderText, { color: colors.text }]} numberOfLines={2}>
          OS {schedule.order.order_number} · {schedule.order.equipment?.equipment ?? 'Equipamento'} · {schedule.order.model ?? 'Modelo nao informado'}
        </Text>
      ) : null}
      {address ? <TextMuted>{address}</TextMuted> : null}

      <View style={styles.scheduleActions}>
        {mapsUrl ? (
          <Pressable onPress={() => Linking.openURL(mapsUrl)} style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && styles.pressed]}>
            <MaterialIcons name="route" size={18} color={colors.text} />
            <Text style={[styles.actionText, { color: colors.text }]}>Rota</Text>
          </Pressable>
        ) : null}
        {canUpdateStatus ? (
          <Pressable
            disabled={loading || isOnTheWay}
            onPress={() => onMarkOnTheWay(schedule)}
            style={({ pressed }) => [
              styles.actionButton,
              { borderColor: colors.border, opacity: loading || isOnTheWay ? 0.6 : pressed ? 0.72 : 1 },
            ]}>
            <MaterialIcons name="directions-car" size={18} color={colors.text} />
            <Text style={[styles.actionText, { color: colors.text }]}>{isOnTheWay ? 'A caminho' : loading ? 'Enviando' : 'A caminho'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  companyLogoWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: 'rgba(245, 244, 239, 0.12)',
  },
  companyLogo: {
    width: 48,
    height: 48,
  },
  companyText: {
    flex: 1,
    minWidth: 0,
  },
  companyName: {
    marginTop: 4,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    minHeight: 104,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    justifyContent: 'space-between',
  },
  summaryValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  summaryLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18243a',
  },
  scheduleList: {
    gap: 12,
  },
  scheduleCard: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    backgroundColor: 'rgba(11, 18, 32, 0.46)',
  },
  featuredSchedule: {
    backgroundColor: 'rgba(0, 180, 255, 0.08)',
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
  scheduleTime: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scheduleTitle: {
    marginTop: 3,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  statusPill: {
    maxWidth: 132,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  orderText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  scheduleActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionButton: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '800',
  },
  actions: {
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

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatAddress(schedule: TechnicianSchedule) {
  const address = schedule.customer?.address;

  if (!address) return null;

  return [address.street, address.number, address.district, address.city, address.state]
    .filter((item) => item !== undefined && item !== null && String(item).trim().length > 0)
    .join(', ');
}
