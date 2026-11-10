import { LogOut } from "lucide-react";
import { SideNav, TabBar } from "@/components/AppNav";
import { APP_NAME } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";

function SignOut({ label }: { label: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-page hover:text-ink">
        <LogOut size={17} aria-hidden="true" />
        {label}
      </button>
    </form>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const who = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "";

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-4 py-6 md:flex">
        <p className="px-3 font-serif text-xl font-bold">{APP_NAME}</p>
        <SideNav />
        <div className="mt-auto border-t border-line pt-4">
          <p className="truncate px-3 pb-2 text-sm text-muted" title={who}>{who}</p>
          <SignOut label="Sign out" />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-2 md:hidden">
          <p className="font-serif text-lg font-bold">{APP_NAME}</p>
          <SignOut label="Sign out" />
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-8 md:py-10">{children}</main>
      </div>
      <TabBar />
    </div>
  );
}
