import { getTranslations } from "next-intl/server";

const screens = ["AD-01", "AD-02", "AD-03", "AD-04", "AD-05", "AD-06", "AD-07"] as const;

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("shell-admin");
  return (
    <div className="min-h-dvh min-w-[360px] bg-background text-foreground md:flex">
      <aside className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:w-64 md:shrink-0 md:border-r md:border-b-0">
        <div className="px-4 py-5 text-xl font-semibold">PJ-8</div>
        <nav aria-label="PJ-8" className="grid grid-cols-2 gap-2 p-3 md:grid-cols-1">
          {screens.map((id) => (
            <button key={id} type="button" disabled className="min-h-11 rounded-lg px-3 py-2 text-left text-sm opacity-50">
              {t(id)}
            </button>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
