import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { useSession } from '@/lib/session-context';

type AppHeaderProps = {
  back?: boolean;
  close?: boolean;
  logout?: boolean;
  user?: boolean;
};

export default function AppHeader({ back, close, logout, user }: AppHeaderProps) {
  const { baseUrl, session, signOut } = useSession();
  const logoSource = getCompanyLogoSource(session?.company?.logo_url ?? session?.company?.logo, baseUrl);
  const avatar = getUserAvatar(session?.user);

  return (
    <View style={styles.container}>
      <View style={styles.side}>
        {user ? (
          avatar ? (
            <AvatarButton avatar={avatar} baseUrl={baseUrl} onPress={() => router.replace('/home')} />
          ) : (
            <IconButton name="account-circle" onPress={() => router.replace('/home')} />
          )
        ) : null}
        {back ? <IconButton name="chevron-left" onPress={() => router.back()} /> : null}
      </View>

      <View style={styles.logoWrap}>
        <Image source={logoSource} style={styles.logo} resizeMode="contain" />
      </View>

      <View style={[styles.side, styles.sideRight]}>
        {close ? <IconButton name="close" onPress={() => router.replace('/home')} /> : null}
        {logout ? <IconButton name="logout" onPress={() => signOut()} /> : null}
      </View>
    </View>
  );
}

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

function getImageSource(image: string, baseUrl: string) {
  if (/^https?:\/\//i.test(image)) {
    return { uri: image };
  }

  const serverUrl = baseUrl.replace(/\/api\/?$/, '');
  const normalizedImage = image.replace(/^\/+/, '');

  return { uri: `${serverUrl}/${normalizedImage}` };
}

function getUserAvatar(user: {
  avatar?: string | null;
  avatar_url?: string | null;
  photo?: string | null;
  photo_url?: string | null;
  image?: string | null;
  image_url?: string | null;
} | null | undefined) {
  return user?.avatar_url ?? user?.avatar ?? user?.photo_url ?? user?.photo ?? user?.image_url ?? user?.image ?? null;
}

function IconButton({ name, onPress }: { name: keyof typeof MaterialIcons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <MaterialIcons name={name} size={24} color="#f5f4ef" />
    </Pressable>
  );
}

function AvatarButton({ avatar, baseUrl, onPress }: { avatar: string; baseUrl: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <Image source={getImageSource(avatar, baseUrl)} style={styles.avatar} resizeMode="cover" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#0b1220',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 244, 239, 0.12)',
  },
  side: {
    width: 44,
    alignItems: 'flex-start',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101a2d',
    borderWidth: 1,
    borderColor: 'rgba(245, 244, 239, 0.12)',
  },
  pressed: {
    opacity: 0.72,
  },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101a2d',
    borderWidth: 1,
    borderColor: 'rgba(245, 244, 239, 0.12)',
  },
  logo: {
    width: 34,
    height: 34,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
});
