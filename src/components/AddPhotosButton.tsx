"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { ACCEPTED_FILES } from "@/lib/fileTypes";
import { usePhotos } from "./PhotosProvider";

/** A file picker styled as anything (big tile, small "+" button). Goes to the upload screen after picking. */
export function AddPhotosButton({ className, children, label }: { className: string; children: React.ReactNode; label?: string }) {
  const id = useId();
  const router = useRouter();
  const { addFiles } = usePhotos();

  return (
    <>
      <input
        id={id}
        type="file"
        accept={ACCEPTED_FILES}
        multiple
        className="peer sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length === 0) return;
          addFiles(files);
          router.push("/upload");
        }}
      />
      <label
        htmlFor={id}
        aria-label={label}
        className={`cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${className}`}
      >
        {children}
      </label>
    </>
  );
}
