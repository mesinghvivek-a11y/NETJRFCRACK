export const metadata = { title: "Test" };

// The exam screen has no site menu, like the real NTA screen.
export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-page">{children}</div>;
}
