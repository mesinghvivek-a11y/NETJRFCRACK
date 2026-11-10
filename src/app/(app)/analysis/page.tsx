export const metadata = { title: "My analysis" };

export default function Page() {
  return (
    <section>
      <h1 className="font-serif text-2xl font-bold md:text-3xl">My analysis</h1>
      <p className="mt-3 max-w-prose text-muted">Your test history, accuracy and weak and strong topics will appear here after your first test.</p>
    </section>
  );
}
