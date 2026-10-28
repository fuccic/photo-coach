import { useMemo } from "react";
import type { Issue } from "@/lib/analysis/checks";
import { solveFix, type Fix } from "@/lib/fixes/solver";
import { formatChange } from "@/lib/fixes/steps";
import { guideFor, type Control, type Diagram, type Guide } from "@/lib/instructions";
import type { Photo } from "./PhotosProvider";

export function useFix(photo: Photo | undefined, issue: Issue | undefined): { fix: Fix; guide: Guide } | undefined {
  const meta = photo?.meta;
  const stats = photo?.stats;
  return useMemo(() => {
    if (!issue) return undefined;
    const guide = guideFor(meta?.device);
    return { fix: solveFix(issue, meta, stats, guide), guide };
  }, [issue, meta, stats]);
}

/** "ISO 100 → 800", one line per change, or the goal when there's nothing to dial in. */
export function ChangeLines({ fix, size = "md" }: { fix: Fix; size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-[28px]" : "text-[22px]";
  if (fix.changes.length === 0) {
    return <p className={`${text} leading-tight font-bold`}>{fix.goal}</p>;
  }
  return (
    <ul aria-label="Change" className={`flex flex-col gap-1 font-mono ${text}`}>
      {fix.changes.map((c) => {
        const { from, to } = formatChange(c);
        return (
          <li key={c.setting} className="flex flex-wrap items-center gap-x-2.5">
            {from && <span className="text-muted">{from}</span>}
            {from && <Arrow />}
            <span className="font-medium text-accent-ink">{to}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Arrow() {
  return (
    <svg aria-label="to" role="img" width="0.9em" height="0.9em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const WARN = "#f5a524";
const PART = "#3a3f48";
const EDGE = "#4a4f58";

/** The device drawn plainly, with the control for the current step lit up. */
export function DeviceDiagram({ diagram, active, label }: { diagram: Diagram; active?: string; label: string }) {
  const lit = active ? diagram.controls[active] : undefined;
  return (
    <figure className="flex flex-col items-center gap-2">
      <svg role="img" aria-label={label} viewBox="0 0 320 200" className="h-auto w-full max-w-[400px]">
        {diagram.body === "camera-back" ? <CameraBody /> : <PhoneBody />}
        {Object.entries(diagram.controls).map(([id, c]) => (
          <ControlShape key={id} c={c} on={id === active} />
        ))}
      </svg>
      <figcaption
        className={`min-h-7 rounded-full px-3 py-0.5 text-[15px] font-bold text-[#121826] ${lit ? "bg-warn" : "invisible"}`}
        aria-live="polite"
      >
        {lit?.label}
      </figcaption>
    </figure>
  );
}

function CameraBody() {
  return (
    <g>
      <rect x="60" y="18" width="76" height="32" rx="8" fill="#2a2d33" />
      <rect x="10" y="40" width="300" height="148" rx="16" fill="#2a2d33" />
      <rect x="73" y="26" width="50" height="16" rx="5" fill="#15171b" />
      <rect x="24" y="70" width="172" height="106" rx="6" fill="#15171b" />
    </g>
  );
}

function PhoneBody() {
  return (
    <g>
      <rect x="110" y="4" width="100" height="192" rx="18" fill="#2a2d33" />
      <rect x="116" y="10" width="88" height="180" rx="13" fill="#15171b" />
      <rect x="116" y="40" width="88" height="48" fill="#4e5a66" />
      <rect x="116" y="88" width="88" height="48" fill="#1e2419" />
      <ellipse cx="152" cy="108" rx="14" ry="8" fill="#0f120d" />
      <circle cx="166" cy="98" r="6" fill="#0f120d" />
    </g>
  );
}

function ControlShape({ c, on }: { c: Control; on: boolean }) {
  const stroke = on ? WARN : EDGE;
  const sw = on ? 3 : 1.5;
  const w = c.w ?? 0;
  const h = c.h ?? 0;
  switch (c.shape) {
    case "dial":
      return <rect x={c.x - w / 2} y={c.y - h / 2} width={w} height={h} rx={3} fill={on ? WARN : PART} stroke={stroke} strokeWidth={sw} />;
    case "button":
      if (c.label === "1x") {
        return (
          <g>
            <circle cx={c.x} cy={c.y} r={c.r} fill={on ? WARN : "rgba(0,0,0,0.5)"} stroke={stroke} strokeWidth={sw} />
            <text x={c.x} y={c.y + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill={on ? "#121826" : "#ffffff"}>
              1x
            </text>
          </g>
        );
      }
      if (c.label === "Shutter") {
        return <circle cx={c.x} cy={c.y} r={c.r} fill="#ffffff" stroke={on ? WARN : "#9aa0a8"} strokeWidth={on ? 4 : 2} />;
      }
      if (c.label === "Night mode") {
        return (
          <g>
            <circle cx={c.x} cy={c.y} r={c.r} fill={on ? WARN : "rgba(255,255,255,0.15)"} stroke={on ? WARN : "none"} strokeWidth={sw} />
            <path d={`M${c.x + 2} ${c.y - 4}a4.5 4.5 0 1 0 3 6a3.5 3.5 0 0 1-3-6z`} fill={on ? "#121826" : "#ffffff"} />
          </g>
        );
      }
      return <circle cx={c.x} cy={c.y} r={c.r} fill={on ? WARN : PART} stroke={stroke} strokeWidth={sw} />;
    case "wheel":
      return <circle cx={c.x} cy={c.y} r={c.r} fill="#1e2126" stroke={stroke} strokeWidth={on ? 6 : 2} />;
    case "wheel-side": {
      const r = c.r ?? 0;
      const [dx, dy] = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[c.side ?? "right"];
      // A 70° arc on that side of the wheel.
      const a = (35 * Math.PI) / 180;
      const p = (s: number) => [c.x + r * (dx * Math.cos(a) - s * dy * Math.sin(a)), c.y + r * (dy * Math.cos(a) + s * dx * Math.sin(a))];
      const [x1, y1] = p(-1);
      const [x2, y2] = p(1);
      return (
        <g>
          {on && <path d={`M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}`} fill="none" stroke={WARN} strokeWidth={8} strokeLinecap="round" />}
          <text x={c.x + dx * r * 0.62} y={c.y + dy * r * 0.62 + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill={on ? WARN : "#8a909a"}>
            {c.label}
          </text>
        </g>
      );
    }
    case "area":
      return (
        <rect
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
        <g>
          <path d={`M${c.x} ${c.y - h / 2}v${h}`} stroke={WARN} strokeWidth={2} />
          <circle cx={c.x} cy={c.y} r={6} fill={WARN} />
        </g>
      );
  }
}
