"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavBar() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <div className="relative z-50 flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      {!isHome ? (
        <Link
          href="/"
          className="text-xs px-3 py-1.5 rounded-full font-semibold transition-all"
          style={{
            background: "rgba(99,102,241,0.25)",
            color: "#a5b4fc",
            border: "1px solid rgba(99,102,241,0.5)",
          }}
        >
          ← Classify Issue
        </Link>
      ) : (
        <div />
      )}

      <Link
        href="/log"
        className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all ${pathname === "/log" ? "pointer-events-none opacity-50" : ""}`}
        style={{
          background: "rgba(255,255,255,0.07)",
          color: "rgba(165,180,252,0.6)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        📋 Ticket Log
      </Link>
    </div>
  );
}
