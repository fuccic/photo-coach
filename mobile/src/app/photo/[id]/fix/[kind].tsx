import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { solveFix } from "@core/fixes/solver";
import { formatChange, stepsFor } from "@core/fixes/steps";
import { guideFor } from "@core/instructions";
import { DeviceDiagram } from "@/components/DeviceDiagram";
import { usePhoto } from "@/lib/photos";
import { color } from "@/lib/theme";

export default function FixSteps() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>();
  const photo = usePhoto(id);
  const [done, setDone] = useState<boolean[]>([]);

  const solved = useMemo(() => {
    const issue = photo?.issues?.find((i) => i.kind === kind);
    if (!photo || !issue) return undefined;
    const guide = guideFor(photo.meta?.device);
    return { fix: solveFix(issue, photo.meta, photo.stats, guide, photo.issues ?? []), guide };
  }, [photo, kind]);

  if (!photo || !solved) {
    return (
      <View style={styles.center}>
        <Text style={styles.big}>Nothing to fix here</Text>
      </View>
    );
  }

  const { fix, guide } = solved;
  const steps = stepsFor(fix, guide, photo.meta?.mode);
  const current = steps.findIndex((_, i) => !done[i]);
  const assumed = steps.some((s) => s.assumed);
  const toggle = (i: number) => setDone((d) => Object.assign([...d], { [i]: !d[i] }));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 48 }}>
      <Text style={styles.device}>{photo.meta?.device?.name ?? "Unknown camera"}</Text>

      {fix.changes.length === 0 ? (
        <Text style={styles.big}>{fix.goal}</Text>
      ) : (
        <View style={{ gap: 4 }}>
          {fix.changes.map((c) => {
            const { from, to } = formatChange(c);
            return (
              <Text key={c.setting} style={styles.change}>
                {from && <Text style={{ color: color.muted }}>{from} → </Text>}
                <Text style={{ color: color.accentInk, fontWeight: "600" }}>{to}</Text>
              </Text>
            );
          })}
        </View>
      )}
      {fix.tradeOff && <Text style={styles.note}>{fix.tradeOff}</Text>}

      {guide.diagram && (
        <View style={styles.diagram}>
          <DeviceDiagram diagram={guide.diagram} active={current === -1 ? undefined : steps[current].control} />
        </View>
      )}

      <View style={{ gap: 6 }}>
        {steps.map((s, i) => (
          <Pressable
            key={i}
            onPress={() => toggle(i)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!done[i] }}
            style={[styles.step, i === current && styles.stepNow]}
          >
            <View style={[styles.tick, done[i] && styles.tickDone]}>
              <Text style={[styles.tickText, done[i] && styles.tickTextDone]}>{done[i] ? "✓" : i + 1}</Text>
            </View>
            <Text style={[styles.stepText, done[i] && { color: color.muted, textDecorationLine: "line-through" }]}>
              {s.text}
              {s.assumed ? " *" : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.source}>
        {assumed ? `* ${guide.assumedNote ?? `From older models, not yet checked on the ${photo.meta?.device?.name ?? "this model"}.`} ` : ""}
        {guide.source}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.bg },
  device: { fontSize: 15, color: color.muted },
  big: { fontSize: 28, fontWeight: "700", color: color.ink },
  change: { fontSize: 28, fontVariant: ["tabular-nums"] },
  note: { fontSize: 15, color: color.muted },
  diagram: { backgroundColor: color.surface, borderRadius: 20, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 12 },
  step: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 14, minHeight: 52 },
  stepNow: { backgroundColor: color.surface },
  tick: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: color.accent, alignItems: "center", justifyContent: "center" },
  tickDone: { backgroundColor: color.accent },
  tickText: { fontSize: 14, fontWeight: "700", color: color.ink },
  tickTextDone: { color: color.onAccent },
  stepText: { flex: 1, fontSize: 17, color: color.ink },
  source: { fontSize: 13, color: color.muted },
});
