import Link from "next/link";
import { BackIcon } from "./icons";

export function TopBar({ back, children, right }: { back: string; children?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2 px-3 pt-12 pb-2">
      <Link href={back} aria-label="Back" className="flex size-11 items-center justify-center">
        <BackIcon />
      </Link>
      <div className="min-w-0 grow">{children}</div>
      {right}
    </header>
  );
}
