import { useEffect } from "react";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  useRouter,
  useSegments,
} from "expo-router";
import { ActivityIndicator, Pressable, Text, useColorScheme, View } from "react-native";

import "@/global.css";

import Providers from "@/components/providers";
import { useAuth } from "@/components/auth-provider";

function RootNavigator() {
  const { session, profileStatus, loading, refreshProfileStatus } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const onSetupUsername = segments[1] === "setup-username";

    if (!session) {
      if (!inAuthGroup) router.replace("/(auth)/login");
      return;
    }

    if (profileStatus === "present") {
      // "/" is the Trending tab home — its route is now
      // `(tabs)/(index)` (the tab screens moved into the shared
      // array-group folder `(tabs)/(index,explore)/`), so `/(tabs)` is
      // no longer a leaf href. `inAuthGroup` still keys off
      // `segments[0] === "(auth)"`, so a signed-in user on a `(tabs)`
      // detail screen (segments[0] === "(tabs)") is NOT redirected.
      if (inAuthGroup) router.replace("/");
      return;
    }

    if (profileStatus === "missing") {
      if (!onSetupUsername) router.replace("/(auth)/setup-username");
      return;
    }

    // profileStatus === "error": do NOT route — render path shows a retry.
  }, [session, profileStatus, loading, segments, router]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-default">
        <ActivityIndicator />
      </View>
    );
  }

  if (session && profileStatus === "error") {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-surface-default px-6">
        <Text className="text-center text-text-primary">
          Couldn&apos;t load your profile. Check your connection and try again.
        </Text>
        <Pressable
          className="rounded-lg bg-brand px-4 py-3"
          onPress={() => refreshProfileStatus()}
        >
          <Text className="font-semibold text-text-primary">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <Providers>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <RootNavigator />
      </ThemeProvider>
    </Providers>
  );
}
