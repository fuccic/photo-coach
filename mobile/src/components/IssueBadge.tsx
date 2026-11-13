import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { IssueKind } from "@core/analysis/checks";
import { color } from "@/lib/theme";

// Same icons as the website (src/components/Issues.tsx), on a 24px grid.
const ICONS: Record<IssueKind | "good", string> = {
  dark: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  bright:
    "M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  shake: "M4 9h10M4 15h16M8 12h12",
  focus: "M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z",
  grain: "M6 6h.01M12 6h.01M18 6h.01M9 10h.01M15 10h.01M6 14h.01M12 14h.01M18 14h.01M9 18h.01M15 18h.01",
  good: "M5 12l5 5 9-10",
};

const TONE = { big: color.warn, small: color.info, good: color.good };

export function IssueBadge({ kind, tone, size = 32 }: { kind: IssueKind | "good"; tone: keyof typeof TONE; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: TONE[tone], alignItems: "center", justifyContent: "center" }}
    >
      <Svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        <Path
          d={ICONS[kind]}
          stroke={color.badgeInk}
          strokeWidth={kind === "grain" ? 3 : 2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
