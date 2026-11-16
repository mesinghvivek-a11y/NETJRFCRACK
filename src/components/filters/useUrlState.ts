"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Filters that live in the address bar: shareable, back-button friendly, and read by the server. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const get = (key: string): string => sp.get(key) ?? "";
  const list = (key: string): string[] => get(key).split(",").map((x: string) => x.trim()).filter((x: string) => x.length > 0);

  const set = (patch: Record<string, string | null | undefined>): void => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("page");
    const qs = p.toString();
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return { get, list, set, pending };
}
