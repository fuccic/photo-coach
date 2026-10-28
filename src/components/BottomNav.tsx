import Link from "next/link";
import { GridIcon, HomeIcon } from "./icons";

const TABS = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/library", label: "Library", Icon: GridIcon },
] as const;

export function BottomNav({ current }: { current: "/" | "/library" }) {
  return (
    <nav aria-label="Main" className="sticky bottom-0 flex md:hidden justify-around border-t border-line bg-bg pt-2 pb-[max(24px,env(safe-area-inset-bottom))]">
      {TABS.map(({ href, label, Icon }) => {
        const active = href === current;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 min-w-18 flex-col items-center gap-1 text-xs ${active ? "font-medium text-accent-ink" : "text-muted"}`}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
