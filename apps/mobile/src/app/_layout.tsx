import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

import '@/global.css';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import Providers from '@/components/providers';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    // Providers wraps every app-wide React context (TanStack Query
    // today; Supabase auth, etc. as we add them). Sits OUTSIDE
    // ThemeProvider so theme-aware components can call query hooks
    // — Providers must outlive any consumer.
    <Providers>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AppTabs />
      </ThemeProvider>
    </Providers>
  );
}
