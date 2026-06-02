/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorDark = '#00b4ff';

export const Colors = {
  light: {
    text: '#f5f4ef',
    background: '#0b1220',
    tint: '#00b4ff',
    card: '#101a2d',
    muted: '#18243a',
    mutedText: '#a8b3c7',
    border: 'rgba(245, 244, 239, 0.12)',
    accent: '#0d47a1',
    accentText: '#ffffff',
    success: '#00e59b',
    icon: '#a8b3c7',
    tabIconDefault: '#a8b3c7',
    tabIconSelected: '#00b4ff',
  },
  dark: {
    text: '#ffffff',
    background: '#0b1220',
    tint: tintColorDark,
    card: '#101a2d',
    muted: '#18243a',
    mutedText: '#a8b3c7',
    border: '#25334e',
    accent: '#0d47a1',
    accentText: '#ffffff',
    success: '#00e59b',
    icon: '#a8b3c7',
    tabIconDefault: '#a8b3c7',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
