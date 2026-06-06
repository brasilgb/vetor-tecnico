import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { deleteTechnicianPushToken, registerTechnicianPushToken, TechnicianSchedule } from '@/lib/api';

const STORAGE_PUSH_TOKEN = '@VetorTecnico:expo-push-token';
const STORAGE_NOTIFIED_SCHEDULE_IDS = '@VetorTecnico:notified-schedule-ids';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function openScheduleFromNotification(response: Notifications.NotificationResponse) {
  const scheduleId = response.notification.request.content.data?.schedule_id;

  if (!scheduleId) {
    return;
  }

  router.push(`/agendamentos/${scheduleId}` as never);
}

function getProjectId() {
  const expoConfig = Constants.expoConfig as { extra?: { eas?: { projectId?: string } } } | null;

  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    Constants.easConfig?.projectId ||
    expoConfig?.extra?.eas?.projectId
  );
}

function getDeviceName() {
  const constants = Constants as typeof Constants & {
    deviceName?: string | null;
  };

  return constants.deviceName ?? null;
}

export async function ensureTechnicianLocalNotifications() {
  if (Platform.OS === 'web') {
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('technician-schedules', {
      name: 'Atendimentos técnicos',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#15365f',
    });
  }

  const permissions = await Notifications.getPermissionsAsync();
  let finalStatus = permissions.status;

  if (permissions.status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') {
    throw new Error('Permissao de notificacoes nao concedida.');
  }

  return true;
}

export async function registerForTechnicianPushNotifications(baseUrl: string, accessToken: string) {
  if (Platform.OS === 'web') {
    return null;
  }

  await ensureTechnicianLocalNotifications();

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('EAS projectId ausente na configuracao do Expo.');
  }

  const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  await registerTechnicianPushToken(baseUrl, accessToken, {
    expo_push_token: pushToken,
    platform: Platform.OS,
    device_name: getDeviceName(),
  });
  await AsyncStorage.setItem(STORAGE_PUSH_TOKEN, pushToken);

  return pushToken;
}

export async function unregisterTechnicianPushNotifications(baseUrl: string, accessToken: string) {
  const pushToken = await AsyncStorage.getItem(STORAGE_PUSH_TOKEN);

  if (!pushToken) {
    return;
  }

  await deleteTechnicianPushToken(baseUrl, accessToken, pushToken).catch(() => undefined);
  await AsyncStorage.removeItem(STORAGE_PUSH_TOKEN);
}

export async function notifyNewTechnicianSchedulesLocally(schedules: TechnicianSchedule[]) {
  if (Platform.OS === 'web' || schedules.length === 0) {
    return;
  }

  const notificationsEnabled = await ensureTechnicianLocalNotifications();

  if (!notificationsEnabled) {
    return;
  }

  const notifiedIds = await readNotifiedScheduleIds();
  const nextIds = new Set(notifiedIds);
  const newSchedules = schedules.filter((schedule) => !notifiedIds.has(schedule.id) && schedule.status !== 3);

  for (const schedule of newSchedules) {
    nextIds.add(schedule.id);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Novo atendimento técnico',
        body: formatScheduleNotificationBody(schedule),
        sound: 'default',
        data: {
          type: 'technician_schedule',
          schedule_id: schedule.id,
          schedules_number: schedule.schedules_number,
        },
      },
      trigger: null,
    });
  }

  await AsyncStorage.setItem(STORAGE_NOTIFIED_SCHEDULE_IDS, JSON.stringify(Array.from(nextIds).slice(-200)));
}

export async function rememberTechnicianSchedulesForLocalNotifications(schedules: TechnicianSchedule[]) {
  if (Platform.OS === 'web') {
    return;
  }

  const notifiedIds = await readNotifiedScheduleIds();
  const nextIds = new Set(notifiedIds);

  schedules.forEach((schedule) => {
    nextIds.add(schedule.id);
  });

  await AsyncStorage.setItem(STORAGE_NOTIFIED_SCHEDULE_IDS, JSON.stringify(Array.from(nextIds).slice(-200)));
}

export async function clearTechnicianLocalNotificationHistory() {
  await AsyncStorage.removeItem(STORAGE_NOTIFIED_SCHEDULE_IDS);
}

async function readNotifiedScheduleIds() {
  const value = await AsyncStorage.getItem(STORAGE_NOTIFIED_SCHEDULE_IDS);

  if (!value) {
    return new Set<number>();
  }

  try {
    const ids = JSON.parse(value) as number[];

    return new Set(ids.filter((id) => Number.isFinite(id)));
  } catch {
    await AsyncStorage.removeItem(STORAGE_NOTIFIED_SCHEDULE_IDS);
    return new Set<number>();
  }
}

function formatScheduleNotificationBody(schedule: TechnicianSchedule) {
  const customer = schedule.customer?.name;
  const service = schedule.service;

  return [customer ? `Cliente: ${customer}` : null, service ? `Serviço: ${service}` : null]
    .filter(Boolean)
    .join(' - ') || `Agenda #${schedule.schedules_number}`;
}

export function listenForTechnicianNotificationResponses() {
  Notifications.getLastNotificationResponseAsync()
    .then((lastResponse) => {
      if (lastResponse) {
        openScheduleFromNotification(lastResponse);
      }
    })
    .catch(() => undefined);

  return Notifications.addNotificationResponseReceivedListener(openScheduleFromNotification);
}
