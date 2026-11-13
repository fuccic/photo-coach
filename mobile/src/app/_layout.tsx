import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PhotosProvider } from "@/lib/photos";
import { color } from "@/lib/theme";

export default function RootLayout() {
  return (
    <PhotosProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.accent,
          headerTitleStyle: { color: color.ink, fontWeight: "700" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: color.bg },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="index" options={{ title: "Photo Coach" }} />
        <Stack.Screen name="photo/[id]/index" options={{ title: "" }} />
        <Stack.Screen name="photo/[id]/fix/[kind]" options={{ title: "" }} />
      </Stack>
    </PhotosProvider>
  );
}
