"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AddPhotosButton } from "./AddPhotosButton";
import { AddPhotoIcon } from "./icons";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/library", label: "Library" },
] as const;

/** Top bar for wide screens; phones use BottomNav instead. */
export function DesktopHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 hidden border-b border-line bg-bg/95 backdrop-blur md:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-8">
        <Link href="/" className="text-xl font-bold tracking-tight">
          Photo Coach
        </Link>
        <nav aria-label="Main" className="flex gap-1">
          {TABS.map(({ href, label }) => {
            const active = href === pathname;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center rounded-full px-4 text-[15px] ${active ? "bg-surface font-medium text-accent-ink" : "text-muted hover:text-ink"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <AddPhotosButton className="ml-auto flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-[15px] font-medium text-on-accent hover:bg-accent-ink">
          <AddPhotoIcon size={18} />
          Add photos
        </AddPhotosButton>
      </div>
    </header>
  );
}
