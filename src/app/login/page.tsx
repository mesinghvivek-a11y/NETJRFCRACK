import { Suspense } from "react";
import { Contours } from "@/components/Contours";
import { APP_NAME } from "@/lib/brand";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh md:grid-cols-2">
      <section className="relative overflow-hidden bg-ink px-6 py-10 text-white md:flex md:flex-col md:justify-end md:px-12 md:py-14">
        <Contours className="absolute inset-0 h-full w-full text-[#5FB3BF] opacity-35" />
        <div className="relative">
          <p className="font-serif text-lg font-bold">{APP_NAME}</p>
          <h1 className="mt-6 max-w-md font-serif text-3xl font-bold leading-tight md:text-4xl">
            Every UGC NET Geography question, sorted by unit and topic.
          </h1>
          <p className="mt-3 max-w-sm text-white/75">
            Practise by topic, sit timed tests built like the NTA paper, and see which units need your time.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-10">
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
