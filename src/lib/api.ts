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

export type TechnicianSchedule = {
  id: number;
  tenant_id?: number;
  schedules_number: number;
  schedules: string;
  service?: string | null;
  details?: string | null;
  status: number;
  status_label?: string | null;
  observations?: string | null;
  send_to_technician?: boolean;
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
    email?: string | null;
    observations?: string | null;
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
    tracking_token?: string | null;
    model?: string | null;
    defect?: string | null;
    state_conservation?: string | null;
    accessories?: string | null;
    budget_description?: string | null;
    budget_value?: string | number | null;
    observations?: string | null;
    services_performed?: string | null;
    service_cost?: string | number | null;
    delivery_forecast?: string | null;
    delivery_date?: string | null;
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

export async function getTechnicianSchedule(baseUrl: string, token: string, scheduleId: number) {
  return request<TechnicianSchedule>(baseUrl, `/tecnico/agendamentos/${scheduleId}`, token);
}

export async function updateTechnicianScheduleStatus(
  baseUrl: string,
  token: string,
  scheduleId: number,
  payload: {
    status: 1 | 2 | 3;
  },
) {
  return request<TechnicianSchedule>(baseUrl, `/tecnico/agendamentos/${scheduleId}/status`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function checkInTechnicianSchedule(
  baseUrl: string,
  token: string,
  scheduleId: number,
  payload: {
    latitude?: number;
    longitude?: number;
    observations?: string;
  },
) {
  return request<TechnicianSchedule>(baseUrl, `/tecnico/agendamentos/${scheduleId}/check-in`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function checkOutTechnicianSchedule(
  baseUrl: string,
  token: string,
  scheduleId: number,
  payload: {
    latitude?: number;
    longitude?: number;
    observations?: string;
  },
) {
  return request<TechnicianSchedule>(baseUrl, `/tecnico/agendamentos/${scheduleId}/check-out`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
