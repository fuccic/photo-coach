"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AddPhotoIcon } from "./icons";
import { usePhotos } from "./PhotosProvider";

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/** Lets people drop photos anywhere on the page (desktop). */
export function DropZone() {
  const router = useRouter();
  const { addFiles } = usePhotos();
  const [active, setActive] = useState(false);

  useEffect(() => {
    // dragenter/dragleave fire for every child element, so count them.
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setActive(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setActive(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      addFiles(files);
      router.push("/upload");
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles, router]);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/95 p-6 backdrop-blur-sm">
      <div className="flex size-full max-h-[480px] max-w-3xl flex-col items-center justify-center gap-3 rounded-3xl border-4 border-dashed border-accent text-accent-ink">
        <AddPhotoIcon size={56} />
        <span className="text-2xl font-bold">Drop photos</span>
      </div>
    </div>
  );
}
