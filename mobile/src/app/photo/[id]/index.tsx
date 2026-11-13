import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import type { Issue } from "@core/analysis/checks";
import { GRID, type ImageStats } from "@core/analysis/measure";
import { formatAperture, formatIso, formatShutter } from "@core/format";
import { IssueBadge } from "@/components/IssueBadge";
import { usePhoto } from "@/lib/photos";
import { color } from "@/lib/theme";

export default function PhotoReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const photo = usePhoto(id);
  const [open, setOpen] = useState<string | null>(null);
  const [showArea, setShowArea] = useState(false);

  if (!photo) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>This photo is gone</Text>
      </View>
    );
  }

  const meta = photo.meta;
  const shown = photo.issues?.find((i) => i.kind === open) ?? photo.issues?.[0];
  const settings = [formatShutter(meta?.exposureTime), formatAperture(meta?.fNumber), formatIso(meta?.iso)].filter(Boolean);
  const ratio = photo.width && photo.height ? photo.width / photo.height : 3 / 2;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={{ width: "100%", aspectRatio: ratio, backgroundColor: color.ink }}>
        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        {showArea && photo.stats && shown && <AreaOverlay stats={photo.stats} area={shown.area} />}
        {shown && shown.area.length > 0 && (
          <Pressable
            onPress={() => setShowArea(!showArea)}
            accessibilityRole="button"
            accessibilityState={{ selected: showArea }}
            accessibilityLabel="Show where"
            style={[styles.areaButton, showArea && { backgroundColor: color.accent }]}
          >
            <Text style={styles.areaText}>{showArea ? "Hide" : "Where?"}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.device}>{meta?.device?.name ?? meta?.model ?? "Unknown camera"}</Text>
        {settings.length > 0 && (
          <View style={styles.chips}>
            {settings.map((s) => (
              <Text key={s} style={styles.chip}>
                {s}
              </Text>
            ))}
          </View>
        )}

        {photo.issues === undefined ? (
          <ActivityIndicator color={color.accent} style={{ marginTop: 24 }} />
        ) : photo.issues === null ? (
          <Text style={styles.title}>Can't read this photo</Text>
        ) : photo.issues.length === 0 ? (
          <View style={styles.row}>
            <IssueBadge kind="good" tone="good" />
            <Text style={styles.title}>Looks good</Text>
          </View>
        ) : (
          photo.issues.map((issue) => (
            <IssueCard key={issue.kind} id={photo.id} issue={issue} open={open === issue.kind} onToggle={() => setOpen(open === issue.kind ? null : issue.kind)} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function IssueCard({ id, issue, open, onToggle }: { id: string; issue: Issue; open: boolean; onToggle: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <IssueBadge kind={issue.kind} tone={issue.severity} />
        <Text style={[styles.title, { flex: 1 }]}>{issue.title}</Text>
      </View>
      {open && <Text style={styles.why}>{issue.why}</Text>}
      <View style={styles.row}>
        <Pressable onPress={onToggle} style={styles.ghost} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <Text style={styles.ghostText}>Why?</Text>
        </Pressable>
        <Link href={`/photo/${id}/fix/${issue.kind}`} asChild>
          <Pressable style={styles.fix} accessibilityRole="button">
            <Text style={styles.fixText}>Fix it</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

/** Highlights the tiles where the problem shows most. */
function AreaOverlay({ stats, area }: { stats: ImageStats; area: number[] }) {
  const tile = Math.ceil(Math.max(stats.width, stats.height) / GRID);
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${stats.width} ${stats.height}`} preserveAspectRatio="xMidYMid meet" pointerEvents="none">
      {area.map((i) => {
        const x = (i % stats.cols) * tile;
        const y = Math.floor(i / stats.cols) * tile;
        return <Rect key={i} x={x} y={y} width={Math.min(tile, stats.width - x)} height={Math.min(tile, stats.height - y)} fill="rgba(245,165,36,0.45)" />;
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  areaButton: { position: "absolute", top: 12, right: 12, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.55)" },
  areaText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.bg },
  body: { padding: 16, gap: 12 },
  device: { fontSize: 15, color: color.muted },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { backgroundColor: color.surface, color: color.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, fontSize: 15, fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 20, fontWeight: "700", color: color.ink },
  card: { backgroundColor: color.surface, borderRadius: 20, padding: 16, gap: 12 },
  why: { fontSize: 16, lineHeight: 22, color: color.muted },
  ghost: { minHeight: 44, paddingHorizontal: 16, justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: color.line },
  ghostText: { fontSize: 16, color: color.ink, fontWeight: "600" },
  fix: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: color.accent, alignItems: "center", justifyContent: "center" },
  fixText: { fontSize: 16, color: color.onAccent, fontWeight: "700" },
});
