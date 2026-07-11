"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Today", icon: "❋" },
  { href: "/contacts/c1", label: "Clients", icon: "☙" },
  { href: "/pipeline", label: "Pipeline", icon: "⟡" },
  { href: "/calendar", label: "Calendar", icon: "✧" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#EFE4DE] bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-md justify-around px-2 py-3 md:max-w-5xl">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href.split("/c1")[0]);
          return (
            <Link key={t.href} href={t.href} className="flex flex-col items-center gap-0.5 px-3">
              <span className={`text-lg ${active ? "text-gold" : "text-[#C8B8B0]"}`}>{t.icon}</span>
              <span className={`text-xs ${active ? "font-semibold text-plum" : "text-fog"}`}>
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
