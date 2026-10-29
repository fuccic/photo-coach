"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DeviceLabel } from "@/components/DeviceLabel";
import { ChangeLines, DeviceDiagram, useFix } from "@/components/Fix";
import { usePhotoIssues } from "@/components/Issues";
import { usePhotos } from "@/components/PhotosProvider";
import { TopBar } from "@/components/TopBar";
import { stepsFor } from "@/lib/fixes/steps";
import type { ManualLink as StepManual } from "@/lib/instructions";

export default function ShowMeHow() {
  const { id, kind } = useParams<{ id: string; kind: string }>();
  return <FixSteps key={`${id}/${kind}`} id={id} kind={kind} />;
}

function FixSteps({ id, kind }: { id: string; kind: string }) {
  const { photos, ready } = usePhotos();
  const photo = photos.find((p) => p.id === id);
  const issues = usePhotoIssues(photo);
  const issue = issues?.find((i) => i.kind === kind);
  const solved = useFix(photo, issue, issues);
  const [done, setDone] = useState<boolean[]>([]);
  const back = `/photo/${id}`;

  if (!photo || !solved) {
    // Saved photos are still loading, or this photo is still being checked.
    if (!ready || (photo && photo.stats === undefined)) return <main className="grow" />;
    return (
      <>
        <TopBar back={photo ? back : "/"} />
        <main className="flex grow flex-col items-center justify-center gap-4 px-6 pb-24 text-center">
          <p className="text-lg font-medium">{photo ? "Nothing to fix here" : "This photo is gone"}</p>
          <Link href={photo ? back : "/"} className="flex min-h-12 items-center rounded-2xl bg-accent px-6 font-bold text-on-accent">
            {photo ? "Back to the photo" : "Add a photo"}
          </Link>
        </main>
      </>
    );
  }

  const { fix, guide } = solved;
  const device = photo.meta?.device;
  const steps = stepsFor(fix, guide, photo.meta?.mode);
  const current = steps.findIndex((_, i) => !done[i]);
  const allDone = current === -1;
  const assumed = steps.some((s) => s.assumed);
  const toggle = (i: number) => setDone((d) => Object.assign([...d], { [i]: !d[i] }));

  return (
    <>
      <TopBar back={back}>
        <DeviceLabel device={device} className="text-[15px] text-muted" />
      </TopBar>

      <main className="flex grow flex-col gap-5 px-4 pb-8 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(320px,1fr)] md:items-start md:gap-8">
        <div className="flex flex-col gap-4">
          <div className="px-2">
            <ChangeLines fix={fix} size="lg" />
          </div>
          {guide.diagram && (
            <div className="rounded-[20px] bg-surface px-3 pt-4 pb-3">
              <DeviceDiagram
                diagram={guide.diagram}
                active={allDone ? undefined : steps[current].control}
                label={`${device?.name ?? "Device"} with the control for the current step highlighted`}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 md:pt-2">
          <ol aria-label="Steps" className="flex flex-col gap-1.5 px-2">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={!!done[i]}
                  className="flex min-h-[52px] grow items-center gap-3.5 py-1.5 text-left"
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-[15px] font-bold ${
                      done[i] ? "border-good bg-good text-[#121826]" : i === current ? "border-accent" : "border-line"
                    }`}
                  >
                    {done[i] ? <Tick /> : i + 1}
                  </span>
                  <span className={`text-lg font-medium ${done[i] ? "text-muted line-through decoration-1" : ""}`}>
                    {s.text}
                    {s.assumed && (
                      <span aria-label="not yet checked on this model" className="text-muted">
                        *
                      </span>
                    )}
                  </span>
                </button>
                {s.manual && <ManualLink link={s.manual} />}
              </li>
            ))}
          </ol>

          {fix.tradeOff && <p className="rounded-2xl bg-info/30 px-4 py-3 text-[15px]">{fix.tradeOff}</p>}

          <Link
            href={allDone ? "/" : back}
            className="flex min-h-14 items-center justify-center rounded-2xl bg-accent text-lg font-bold text-on-accent"
          >
            {allDone ? "Take a new photo" : "Done"}
          </Link>

          <p className="px-2 text-xs text-muted">
            {assumed ? `* ${guide.assumedNote ?? `From older models, not yet checked on the ${device?.name}.`} ` : ""}
            {guide.manual ? (
              <a href={guide.manual.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {guide.source}
              </a>
            ) : (
              guide.source
            )}
          </p>
        </div>
      </main>
    </>
  );
}

/** The manual page for a step, opened in a new tab so the steps stay where they were. */
function ManualLink({ link }: { link: StepManual }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Manual: ${link.label}`}
      className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-surface px-3 text-[13px] font-medium text-muted hover:text-ink"
    >
      <BookIcon />
      {link.label}
    </a>
  );
}

function BookIcon() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7" />
    </svg>
  );
}

function Tick() {
  return (
    <svg aria-label="Done" role="img" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
