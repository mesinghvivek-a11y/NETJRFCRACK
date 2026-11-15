import type { Lang } from "@/lib/types";

const mediaUrl = (path: string): string =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question-media/${path}`;

/** Question or option content: paragraph, text, statements, table, image. */
export function QuestionBody({ c }: { c: Lang }) {
  return (
    <>
      {c.context && <span className="mb-3 block whitespace-pre-line border-l-2 border-line pl-3">{c.context}</span>}
      <span className="block whitespace-pre-line">{c.text}</span>
      {c.statements && c.statements.length > 0 && (
        <span className="mt-3 block space-y-2">
          {c.statements.map((st, i) => (
            <span key={i} className="block whitespace-pre-line">{st}</span>
          ))}
        </span>
      )}
      {c.table && (
        <span className="mt-3 block overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {c.table.columns.map((h, i) => (
                  <th key={i} className="border border-line bg-page px-3 py-1.5 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j} className="border border-line px-3 py-1.5">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </span>
      )}
      {c.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(c.image)} alt="Figure for this question" loading="lazy" className="mt-3 max-h-80 w-auto max-w-full rounded-md border border-line" />
      )}
    </>
  );
}
