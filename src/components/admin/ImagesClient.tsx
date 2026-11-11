"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ImagesClient({ paperIds }: { paperIds: string[] }) {
  const [paper, setPaper] = useState<string>(paperIds[0] ?? "");
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question-media`;

  async function load(p: string) {
    if (!p) return;
    const { data } = await createClient().storage.from("question-media").list(p, { limit: 200, sortBy: { column: "name", order: "asc" } });
    setFiles((data ?? []).filter((f: any) => f.name !== ".emptyFolderPlaceholder").map((f: any) => f.name as string));
  }

  useEffect(() => {
    load(paper);
  }, [paper]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    if (list.length === 0 || !paper) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    let ok = 0;
    for (const f of list) {
      const { error } = await supabase.storage.from("question-media").upload(`${paper}/${f.name}`, f, { upsert: true, contentType: f.type || undefined });
      if (error) { setMsg({ ok: false, text: `${f.name}: ${error.message}` }); break; }
      ok++;
    }
    setBusy(false);
    if (ok === list.length) setMsg({ ok: true, text: `Uploaded ${ok} file(s).` });
    e.target.value = "";
    load(paper);
  }

  if (paperIds.length === 0) return <p className="text-muted">Import a paper first. Images are filed under the paper id.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">
          Paper
          <select className="mt-1 block rounded-lg border border-line bg-surface px-3 py-2 text-[15px]" value={paper} onChange={(e) => setPaper(e.target.value)}>
            {paperIds.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-ink">
          {busy ? "Uploading" : "Choose images"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple className="sr-only" onChange={onFiles} disabled={busy} />
        </label>
      </div>
      <p className="mt-2 text-sm text-muted">The file name you upload is the name to use in the image_file column, for example q045.png.</p>
      {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-good" : "text-danger"}`}>{msg.text}</p>}
      <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {files.map((f) => (
          <li key={f} className="rounded-lg border border-line bg-surface p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${base}/${paper}/${f}`} alt={f} className="h-28 w-full rounded object-contain" loading="lazy" />
            <p className="mt-1 truncate text-xs text-muted" title={f}>{f}</p>
          </li>
        ))}
        {files.length === 0 && <li className="col-span-full text-sm text-muted">No images for this paper yet.</li>}
      </ul>
    </div>
  );
}
