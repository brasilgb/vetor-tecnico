import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/app-shell';
import { Card, Message, SelectField, TextMuted, Title } from '@/components/ui-kit';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  ApiError,
  Budget,
  BudgetResult,
  getBudgetModels,
  getBudgets,
  getBudgetServices,
  getReportFilters,
  ReportFilters,
} from '@/lib/api';
import { useSession } from '@/lib/session-context';

export default function OrcamentosScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const { baseUrl, session } = useSession();
  const [filters, setFilters] = useState<ReportFilters | null>(null);
  const [report, setReport] = useState<BudgetResult | null>(null);
  const [equipmentId, setEquipmentId] = useState<number | undefined>();
  const [model, setModel] = useState('');
  const [service, setService] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const token = session?.accessToken;

  const equipmentOptions = useMemo(
    () => [
      { label: 'Selecione o tipo de equipamento', value: '' },
      ...(filters?.equipments.map((equipment) => ({
        label: equipment.equipment,
        value: String(equipment.id),
      })) ?? []),
    ],
    [filters],
  );

  const modelOptions = useMemo(
    () => [
      { label: loadingModels ? 'Carregando modelos...' : 'Selecione o modelo', value: '' },
      ...models.map((item) => ({
        label: item,
        value: item,
      })),
    ],
    [loadingModels, models],
  );

  const serviceOptions = useMemo(
    () => [
      { label: loadingServices ? 'Carregando serviços...' : 'Selecione o serviço', value: '' },
      ...services.map((item) => ({
        label: item,
        value: item,
      })),
    ],
    [loadingServices, services],
  );

  const loadFilters = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setMessage(null);

    try {
      setFilters(await getReportFilters(baseUrl, token));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel carregar filtros.');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, token]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    async function loadModels() {
      if (!token || !equipmentId) {
        setModels([]);
        setModel('');
        setServices([]);
        setService('');
        setReport(null);
        return;
      }

      setLoadingModels(true);
      setMessage(null);
      setModel('');
      setServices([]);
      setService('');
      setReport(null);

      try {
        const response = await getBudgetModels(baseUrl, token, equipmentId);
        setModels(response.models);
        if (response.models.length === 0) {
          setMessage('Nenhum modelo encontrado para este equipamento.');
        }
      } catch (error) {
        setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel carregar modelos.');
      } finally {
        setLoadingModels(false);
      }
    }

    loadModels();
  }, [baseUrl, equipmentId, token]);

  useEffect(() => {
    async function loadServices() {
      if (!token || !equipmentId || !model) {
        setServices([]);
        setService('');
        setReport(null);
        return;
      }

      setLoadingServices(true);
      setMessage(null);
      setService('');
      setReport(null);

      try {
        const response = await getBudgetServices(baseUrl, token, equipmentId, model);
        setServices(response.services);
        if (response.services.length === 0) {
          setMessage('Nenhum serviço encontrado para este modelo.');
        }
      } catch (error) {
        setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel carregar serviços.');
      } finally {
        setLoadingServices(false);
      }
    }

    loadServices();
  }, [baseUrl, equipmentId, model, token]);

  const loadReport = useCallback(async () => {
    if (!token) return;

    if (!equipmentId || !model || !service) {
      setReport(null);
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      setReport(await getBudgets(baseUrl, token, { equipment_id: equipmentId, model, service }));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Nao foi possivel carregar orçamentos.');
    } finally {
      setLoading(false);
    }
  }, [baseUrl, equipmentId, model, service, token]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  if (!session) {
    return (
      <AppShell>
        <Message tone="error">Entre no app para acessar orçamentos.</Message>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Card>
        <Title>Consultar orçamento</Title>
        {message ? <Message tone="error">{message}</Message> : null}
        <SelectField
          label="Tipo de equipamento"
          value={equipmentId ? String(equipmentId) : ''}
          options={equipmentOptions}
          onChange={(value) => setEquipmentId(value ? Number(value) : undefined)}
        />
        <SelectField label="Modelo" value={model} options={modelOptions} onChange={setModel} />
        <SelectField label="Serviço" value={service} options={serviceOptions} onChange={setService} />
        {loading ? <TextMuted>Carregando dados do orçamento...</TextMuted> : null}
      </Card>

      {report ? (
        <Card>
          <Title>Orçamentos encontrados</Title>
          {report.budgets.length === 0 ? <TextMuted>Nenhum orçamento encontrado.</TextMuted> : null}
          {report.budgets.map((budget) => (
            <BudgetItem key={budget.id} budget={budget} borderColor={colors.border} textColor={colors.text} />
          ))}
        </Card>
      ) : null}
    </AppShell>
  );
}

function BudgetItem({ budget, borderColor, textColor }: { budget: Budget; borderColor: string; textColor: string }) {
  return (
    <View style={[styles.orderItem, { borderColor }]}>
      <Text style={[styles.orderTitle, { color: textColor }]}>
        Orçamento #{budget.budget_number} - {formatCurrency(budget.total_value)}
      </Text>
      <TextMuted>
        {budget.equipment?.equipment ?? 'Equipamento'} - {budget.model}
      </TextMuted>
      <TextMuted>{budget.service}</TextMuted>
      {budget.description ? <TextMuted>{budget.description}</TextMuted> : null}
      <TextMuted>
        Peças: {formatCurrency(budget.part_value)} | Mão de obra: {formatCurrency(budget.labor_value)}
      </TextMuted>
      <TextMuted>
        Prazo: {formatHours(budget.estimated_time)} | Garantia: {formatMonths(budget.warranty)}
      </TextMuted>
      {budget.obs ? <TextMuted>Obs: {budget.obs}</TextMuted> : null}
    </View>
  );
}

function formatCurrency(value: string | number | null | undefined) {
  const parsedValue = typeof value === 'number' ? value : Number(value ?? 0);

  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(parsedValue) ? parsedValue : 0,
  );
}

function formatHours(value: string | null | undefined) {
  if (!value) return 'Nao informado';

  return `${value} hs`;
}

function formatMonths(value: string | null | undefined) {
  if (!value) return 'Nao informada';

  return `${value} meses`;
}

const styles = StyleSheet.create({
  orderItem: {
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 4,
  },
  orderTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
});
