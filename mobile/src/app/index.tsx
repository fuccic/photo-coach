import * as ImagePicker from "expo-image-picker";
import { Link } from "expo-router";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { IssueBadge } from "@/components/IssueBadge";
import { usePhotos, type Photo } from "@/lib/photos";
import { color } from "@/lib/theme";

export default function Home() {
  const { photos, add } = usePhotos();

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 20,
      quality: 1,
      // Keep the original file (HEIC on iPhone) so its camera settings are still in it.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    });
    if (result.canceled) return;
    add(result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height })));
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={photos}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 120, flexGrow: 1 }}
        renderItem={({ item }) => <Tile photo={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Check a photo</Text>
            <Text style={styles.emptyText}>See what to change on your camera next time.</Text>
          </View>
        }
      />
      <View style={styles.footer}>
        <Pressable onPress={pick} style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]} accessibilityRole="button">
          <Text style={styles.buttonText}>Pick photos</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Tile({ photo }: { photo: Photo }) {
  return (
    <Link href={`/photo/${photo.id}`} asChild>
      <Pressable style={styles.tile} accessibilityLabel={summary(photo)}>
        <Image source={{ uri: photo.uri }} style={styles.thumb} />
        <View style={styles.badges}>
          {photo.issues === undefined ? (
            <ActivityIndicator color={color.accent} />
          ) : photo.issues === null ? (
            <Text style={styles.small}>Can't read</Text>
          ) : photo.issues.length === 0 ? (
            <IssueBadge kind="good" tone="good" size={24} />
          ) : (
            photo.issues.map((i) => <IssueBadge key={i.kind} kind={i.kind} tone={i.severity} size={24} />)
          )}
        </View>
      </Pressable>
    </Link>
  );
}

function summary(photo: Photo): string {
  if (photo.issues === undefined) return "Checking";
  if (!photo.issues) return "Can't read this photo";
  return photo.issues.length ? photo.issues.map((i) => i.title).join(", ") : "Looks good";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 24, fontWeight: "700", color: color.ink },
  emptyText: { fontSize: 16, color: color.muted, textAlign: "center" },
  tile: { flex: 1, maxWidth: "50%", backgroundColor: color.surface, borderRadius: 16, overflow: "hidden" },
  thumb: { width: "100%", aspectRatio: 1 },
  badges: { flexDirection: "row", gap: 6, padding: 8, minHeight: 40, alignItems: "center" },
  small: { fontSize: 13, color: color.muted },
  footer: { position: "absolute", left: 16, right: 16, bottom: 32 },
  button: { backgroundColor: color.accent, borderRadius: 18, minHeight: 56, alignItems: "center", justifyContent: "center" },
  buttonText: { color: color.onAccent, fontSize: 18, fontWeight: "700" },
});
