"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ReportActions({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function set(next: string) {
    setBusy(true);
    setErr(null);
    const { error } = await createClient().from("error_reports").update({ status: next }).eq("id", id);
    setBusy(false);
    if (error) setErr(error.message);
    else router.refresh();
  }

  const btn = "rounded-lg border border-line px-3 py-1.5 text-sm font-medium disabled:opacity-60";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {status === "open" ? (
        <>
          <button type="button" disabled={busy} onClick={() => set("fixed")} className={btn}>Mark fixed</button>
          <button type="button" disabled={busy} onClick={() => set("rejected")} className={btn}>Reject</button>
        </>
      ) : (
        <button type="button" disabled={busy} onClick={() => set("open")} className={btn}>Reopen</button>
      )}
      {err && <span className="text-sm text-danger">{err}</span>}
    </div>
  );
}
