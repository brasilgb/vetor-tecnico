export type ApiUser = {
  id: number;
  tenant_id: number;
  user_number: number;
  name: string;
  email: string;
  roles: number;
  status: number;
  avatar?: string | null;
  avatar_url?: string | null;
  photo?: string | null;
  photo_url?: string | null;
  image?: string | null;
  image_url?: string | null;
};

export type ApiCompany = {
  name?: string | null;
  logo?: string | null;
  logo_url?: string | null;
};

export type Customer = {
  id: number;
  tenant_id: number;
  customer_number: number;
  name: string;
  cpfcnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  city?: string | null;
  state?: string | null;
  observations?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CustomerPayload = {
  name: string;
  cpfcnpj?: string;
  birth?: string;
  email?: string;
  zipcode?: string;
  state?: string;
  city?: string;
  district?: string;
  street?: string;
  complement?: string;
  number?: number;
  phone?: string;
  contactname?: string;
  whatsapp?: string;
  contactphone?: string;
  observations?: string;
};

export type Equipment = {
  id: number;
  equipment_number: number;
  equipment: string;
};

export type ReportFilters = {
  equipments: Equipment[];
};

export type Budget = {
  id: number;
  tenant_id: number;
  budget_number: number;
  equipment_id: number;
  equipment?: {
    id: number;
    equipment_number: number;
    equipment: string;
  } | null;
  model: string;
  service: string;
  description?: string | null;
  estimated_time?: string | null;
  part_value?: string | number | null;
  labor_value?: string | number | null;
  total_value?: string | number | null;
  warranty?: string | null;
  validity?: number | null;
  obs?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type BudgetResult = {
  filters: {
    equipment_id: number;
    model: string;
    service: string;
  };
  budgets: Budget[];
};

type ModelListResponse = {
  equipment_id?: number;
  models?: string[];
  budgets?: Budget[];
};

type ServiceListResponse = {
  equipment_id?: number;
  model?: string;
  services?: string[];
  budgets?: Budget[];
};

export type BudgetQuery = {
  equipment_id: number;
  model: string;
  service: string;
};

export type TechnicianSchedule = {
  id: number;
  schedules_number: number;
  schedules: string;
  service?: string | null;
  details?: string | null;
  status: number;
  status_label?: string | null;
  technician_status?: string | null;
  technician_status_label?: string | null;
  available_actions?: {
    can_update_status: boolean;
    can_check_in: boolean;
    can_check_out: boolean;
    can_finish: boolean;
    can_cancel: boolean;
    can_edit_service: boolean;
    can_record_local_payment: boolean;
    can_upload_images: boolean;
    remaining_images: number;
  };
  check_in?: {
    at?: string | null;
    latitude?: string | number | null;
    longitude?: string | number | null;
    observations?: string | null;
  };
  check_out?: {
    at?: string | null;
    latitude?: string | number | null;
    longitude?: string | number | null;
    observations?: string | null;
  };
  customer?: {
    id: number;
    name: string;
    phone?: string | null;
    whatsapp?: string | null;
    address?: {
      zipcode?: string | null;
      state?: string | null;
      city?: string | null;
      district?: string | null;
      street?: string | null;
      number?: string | number | null;
      complement?: string | null;
    };
    quick_actions?: {
      phone_url?: string | null;
      whatsapp_url?: string | null;
      maps_url?: string | null;
    };
  } | null;
  order?: {
    id: number;
    order_number: number;
    model?: string | null;
    defect?: string | null;
    service_status?: number | null;
    service_status_label?: string | null;
    equipment?: {
      id: number;
      equipment_number?: number;
      equipment?: string | null;
    } | null;
    mobile_summary?: {
      images_count: number;
      has_images: boolean;
      previous_orders_count: number;
      has_recurrence: boolean;
      same_defect_count?: number;
      has_active_warranty: boolean;
      local_payment_received: boolean;
      has_check_in: boolean;
      has_check_out: boolean;
      has_technician_notes: boolean;
    };
  } | null;
};

export type TechnicianDashboard = {
  summary: {
    today: number;
    pending: number;
    completed: number;
  };
  next_schedule?: TechnicianSchedule | null;
};

export type PaginatedResult<T> = {
  data: T[];
  current_page?: number;
  last_page?: number;
  per_page?: number;
  total?: number;
};

export type TechnicianScheduleQuery = {
  period?: 'today' | 'tomorrow' | 'week' | 'pending' | 'completed';
  date_from?: string;
  date_to?: string;
  status?: number;
  technician_status?: string;
  per_page?: number;
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  result: T;
  errors?: Record<string, string[]>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

const trimBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

async function request<T>(
  baseUrl: string,
  path: string,
  token?: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${trimBaseUrl(baseUrl)}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const json = (await response.json().catch(() => ({}))) as Partial<ApiEnvelope<T>>;

  if (!response.ok) {
    throw new ApiError(json.message ?? 'Nao foi possivel concluir a requisicao.', response.status, json.errors);
  }

  return json.result as T;
}

export async function login(baseUrl: string, email: string, password: string) {
  const response = await fetch(`${trimBaseUrl(baseUrl)}/loginuser`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const json = (await response.json().catch(() => ({}))) as Partial<ApiEnvelope<ApiUser>> & {
    access_token?: string;
    company?: ApiCompany | null;
  };

  if (!response.ok) {
    throw new ApiError(json.message ?? 'Nao foi possivel fazer login.', response.status, json.errors);
  }

  if (!json.result || !json.access_token) {
    throw new ApiError('Resposta de login incompleta.', response.status);
  }

  return {
    access_token: json.access_token,
    user: json.result,
    company: json.company ?? null,
  };
}

export async function logout(baseUrl: string, token: string) {
  await request(baseUrl, '/logoutuser', token);
}

export async function getCustomers(baseUrl: string, token: string) {
  return request<Customer[]>(baseUrl, '/clientes', token);
}

export async function createCustomer(baseUrl: string, token: string, payload: CustomerPayload) {
  return request<Customer>(baseUrl, '/clientes/pre-cadastro', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getReportFilters(baseUrl: string, token: string) {
  return request<ReportFilters>(baseUrl, '/orcamentos/filtros', token);
}

export async function getBudgetModels(baseUrl: string, token: string, equipmentId: number) {
  const params = new URLSearchParams({ equipment_id: String(equipmentId) });

  const result = await request<ModelListResponse | string[] | Budget[]>(
    baseUrl,
    `/orcamentos/modelos?${params.toString()}`,
    token,
  );

  return {
    equipment_id: equipmentId,
    models: normalizeModelList(result),
  };
}

export async function getBudgetServices(baseUrl: string, token: string, equipmentId: number, model: string) {
  const params = new URLSearchParams({ equipment_id: String(equipmentId), model });

  const result = await request<ServiceListResponse | string[] | Budget[]>(
    baseUrl,
    `/orcamentos/servicos?${params.toString()}`,
    token,
  );

  return {
    equipment_id: equipmentId,
    model,
    services: normalizeServiceList(result),
  };
}

export async function getBudgets(baseUrl: string, token: string, query: BudgetQuery) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      params.set(key, String(value));
    }
  });

  return request<BudgetResult>(baseUrl, `/orcamentos?${params.toString()}`, token);
}

export async function getTechnicianDashboard(baseUrl: string, token: string) {
  return request<TechnicianDashboard>(baseUrl, '/tecnico/dashboard', token);
}

export async function getTechnicianSchedules(baseUrl: string, token: string, query: TechnicianScheduleQuery = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      params.set(key, String(value));
    }
  });
  const suffix = params.toString() ? `?${params.toString()}` : '';

  return request<PaginatedResult<TechnicianSchedule>>(baseUrl, `/tecnico/agendamentos${suffix}`, token);
}

export async function updateTechnicianScheduleStatus(
  baseUrl: string,
  token: string,
  scheduleId: number,
  payload: {
    technician_status: string;
    latitude?: number;
    longitude?: number;
    observations?: string;
  },
) {
  return request<TechnicianSchedule>(baseUrl, `/tecnico/agendamentos/${scheduleId}/status`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function normalizeModelList(result: ModelListResponse | string[] | Budget[]) {
  if (Array.isArray(result)) {
    return uniqueStrings(
      result.map((item) => (typeof item === 'string' ? item : item.model)).filter((item): item is string => Boolean(item)),
    );
  }

  if (Array.isArray(result.models)) {
    return uniqueStrings(result.models);
  }

  if (Array.isArray(result.budgets)) {
    return uniqueStrings(result.budgets.map((budget) => budget.model));
  }

  return [];
}

function normalizeServiceList(result: ServiceListResponse | string[] | Budget[]) {
  if (Array.isArray(result)) {
    return uniqueStrings(
      result.map((item) => (typeof item === 'string' ? item : item.service)).filter((item): item is string => Boolean(item)),
    );
  }

  if (Array.isArray(result.services)) {
    return uniqueStrings(result.services);
  }

  if (Array.isArray(result.budgets)) {
    return uniqueStrings(result.budgets.map((budget) => budget.service));
  }

  return [];
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
