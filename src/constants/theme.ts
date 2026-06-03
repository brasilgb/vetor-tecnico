/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorDark = '#2f7dd1';

export const Colors = {
  light: {
    text: '#172033',
    background: '#eef2f7',
    tint: '#2f7dd1',
    card: '#ffffff',
    muted: '#f4f7fb',
    mutedText: '#637083',
    border: '#d8e0ea',
    accent: '#15365f',
    accentText: '#ffffff',
    success: '#197a55',
    icon: '#637083',
    tabIconDefault: '#637083',
    tabIconSelected: '#2f7dd1',
  },
  dark: {
    text: '#eef3f8',
    background: '#0f1724',
    tint: tintColorDark,
    card: '#151f2d',
    muted: '#1e2a3b',
    mutedText: '#a6b2c2',
    border: '#2f3d50',
    accent: '#234b7b',
    accentText: '#ffffff',
    success: '#32b07c',
    icon: '#a6b2c2',
    tabIconDefault: '#a6b2c2',
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
