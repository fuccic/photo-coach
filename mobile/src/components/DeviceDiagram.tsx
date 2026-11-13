import { Text, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from "react-native-svg";
import type { Control, Diagram } from "@core/instructions";
import { color } from "@/lib/theme";

// A port of the website's diagram (src/components/Fix.tsx) to react-native-svg.
const WARN = color.warn;
const PART = "#3a3f48";
const EDGE = "#4a4f58";

/** The device drawn plainly, with the control for the current step lit up. */
export function DeviceDiagram({ diagram, active }: { diagram: Diagram; active?: string }) {
  const lit = active ? diagram.controls[active] : undefined;
  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <Svg viewBox="0 0 320 200" width="100%" style={{ aspectRatio: 320 / 200, maxWidth: 400 }}>
        {diagram.body === "camera-back" ? <CameraBody /> : <PhoneBody />}
        {Object.entries(diagram.controls).map(([id, c]) => (
          <ControlShape key={id} c={c} on={id === active} />
        ))}
      </Svg>
      <View style={{ minHeight: 28, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 2, backgroundColor: lit ? WARN : "transparent" }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: color.badgeInk }}>{lit?.label ?? " "}</Text>
      </View>
    </View>
  );
}

function CameraBody() {
  return (
    <G>
      <Rect x="60" y="18" width="76" height="32" rx="8" fill="#2a2d33" />
      <Rect x="10" y="40" width="300" height="148" rx="16" fill="#2a2d33" />
      <Rect x="73" y="26" width="50" height="16" rx="5" fill="#15171b" />
      <Rect x="24" y="70" width="172" height="106" rx="6" fill="#15171b" />
    </G>
  );
}

function PhoneBody() {
  return (
    <G>
      <Rect x="110" y="4" width="100" height="192" rx="18" fill="#2a2d33" />
      <Rect x="116" y="10" width="88" height="180" rx="13" fill="#15171b" />
      <Rect x="116" y="40" width="88" height="48" fill="#4e5a66" />
      <Rect x="116" y="88" width="88" height="48" fill="#1e2419" />
      <Ellipse cx="152" cy="108" rx="14" ry="8" fill="#0f120d" />
      <Circle cx="166" cy="98" r="6" fill="#0f120d" />
    </G>
  );
}

function ControlShape({ c, on }: { c: Control; on: boolean }) {
  const stroke = on ? WARN : EDGE;
  const sw = on ? 3 : 1.5;
  const w = c.w ?? 0;
  const h = c.h ?? 0;
  switch (c.shape) {
    case "dial":
      return <Rect x={c.x - w / 2} y={c.y - h / 2} width={w} height={h} rx={3} fill={on ? WARN : PART} stroke={stroke} strokeWidth={sw} />;
    case "button":
      if (c.label === "1x") {
        return (
          <G>
            <Circle cx={c.x} cy={c.y} r={c.r} fill={on ? WARN : "rgba(0,0,0,0.5)"} stroke={stroke} strokeWidth={sw} />
            <SvgText x={c.x} y={c.y + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill={on ? color.badgeInk : "#ffffff"}>
              1x
            </SvgText>
          </G>
        );
      }
      if (c.label === "Shutter") {
        return <Circle cx={c.x} cy={c.y} r={c.r} fill="#ffffff" stroke={on ? WARN : "#9aa0a8"} strokeWidth={on ? 4 : 2} />;
      }
      if (c.label === "Night mode") {
        return (
          <G>
            <Circle cx={c.x} cy={c.y} r={c.r} fill={on ? WARN : "rgba(255,255,255,0.15)"} stroke={on ? WARN : "none"} strokeWidth={sw} />
            <Path d={`M${c.x + 2} ${c.y - 4}a4.5 4.5 0 1 0 3 6a3.5 3.5 0 0 1-3-6z`} fill={on ? color.badgeInk : "#ffffff"} />
          </G>
        );
      }
      return <Circle cx={c.x} cy={c.y} r={c.r} fill={on ? WARN : PART} stroke={stroke} strokeWidth={sw} />;
    case "wheel":
      return <Circle cx={c.x} cy={c.y} r={c.r} fill="#1e2126" stroke={stroke} strokeWidth={on ? 6 : 2} />;
    case "wheel-side": {
      const r = c.r ?? 0;
      const [dx, dy] = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[c.side ?? "right"];
      // A 70° arc on that side of the wheel.
      const a = (35 * Math.PI) / 180;
      const p = (s: number) => [c.x + r * (dx * Math.cos(a) - s * dy * Math.sin(a)), c.y + r * (dy * Math.cos(a) + s * dx * Math.sin(a))];
      const [x1, y1] = p(-1);
      const [x2, y2] = p(1);
      return (
        <G>
          {on && <Path d={`M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}`} fill="none" stroke={WARN} strokeWidth={8} strokeLinecap="round" />}
          <SvgText x={c.x + dx * r * 0.62} y={c.y + dy * r * 0.62 + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill={on ? WARN : "#8a909a"}>
            {c.label}
          </SvgText>
        </G>
      );
    }
    case "area":
      return (
        <Rect
          x={c.x - w / 2}
          y={c.y - h / 2}
          width={w}
          height={h}
          fill={on && w < 10 ? WARN : "none"}
          stroke={on ? WARN : w < 10 ? EDGE : "rgba(255,255,255,0.18)"}
          strokeWidth={on ? 2.5 : 1}
          strokeDasharray={on || w < 10 ? undefined : "3 3"}
        />
      );
    case "slider":
      if (!on) return null;
      return (
        <G>
          <Path d={`M${c.x} ${c.y - h / 2}v${h}`} stroke={WARN} strokeWidth={2} />
          <Circle cx={c.x} cy={c.y} r={6} fill={WARN} />
        </G>
      );
  }
}
