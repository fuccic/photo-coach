import { useMemo } from "react";
import { findIssues, type Issue, type IssueKind } from "@/lib/analysis/checks";
import { GRID, type ImageStats } from "@/lib/analysis/measure";
import type { Photo } from "./PhotosProvider";

/** The photo's problems: undefined while it is being checked, null when it can't be checked. */
export function usePhotoIssues(photo: Photo | undefined): Issue[] | null | undefined {
  const stats = photo?.stats;
  const meta = photo?.meta;
  return useMemo(() => (stats ? findIssues(stats, meta) : stats), [stats, meta]);
}

// Stroke paths on a 24px grid, drawn dark on the coloured badge.
const ICONS: Record<IssueKind | "good", string> = {
  dark: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  bright:
    "M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  shake: "M4 9h10M4 15h16M8 12h12",
  focus: "M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z",
  grain: "M6 6h.01M12 6h.01M18 6h.01M9 10h.01M15 10h.01M6 14h.01M12 14h.01M18 14h.01M9 18h.01M15 18h.01",
  good: "M5 12l5 5 9-10",
};

const BADGE = { big: "bg-warn", small: "bg-info", good: "bg-good" };

export function IssueBadge({ kind, tone, size = 32 }: { kind: IssueKind | "good"; tone: keyof typeof BADGE; size?: number }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${BADGE[tone]}`} style={{ width: size, height: size }}>
      <svg
        aria-hidden="true"
        width={size * 0.56}
        height={size * 0.56}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#121826"
        strokeWidth={kind === "grain" ? 3 : 2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={ICONS[kind]} />
      </svg>
    </span>
  );
}

/** Highlights the tiles of a problem area over a photo shown with object-fit: contain. */
export function AreaOverlay({ stats, area }: { stats: ImageStats; area: number[] }) {
  const tile = Math.ceil(Math.max(stats.width, stats.height) / GRID);
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${stats.width} ${stats.height}`}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
    >
      {area.map((i) => {
        const x = (i % stats.cols) * tile;
        const y = Math.floor(i / stats.cols) * tile;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={Math.min(tile, stats.width - x)}
            height={Math.min(tile, stats.height - y)}
            fill="rgba(245,165,36,0.45)"
          />
        );
      })}
    </svg>
  );
}

/** A row of small problem badges, for lists of photos. */
export function IssueSummary({ photo }: { photo: Photo }) {
  const issues = usePhotoIssues(photo);
  if (!issues) return null;
  if (issues.length === 0) {
    return (
      <span className="flex items-center gap-1.5 text-sm">
        <IssueBadge kind="good" tone="good" size={22} />
        Looks good
      </span>
    );
  }
  return (
    <ul aria-label="Problems" className="flex flex-wrap gap-1">
      {issues.map((i) => (
        <li key={i.kind} title={i.title}>
          <IssueBadge kind={i.kind} tone={i.severity} size={22} />
          <span className="sr-only">{i.title}</span>
        </li>
      ))}
    </ul>
  );
}
