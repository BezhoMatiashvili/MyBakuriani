import { safeInternalPath } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function SiteLockedPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = safeInternalPath(params.from) ?? "/";
  const hasError = params.error === "1";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        method="POST"
        action="/api/site-lock/unlock"
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-900">
          საიტი დროებით დახურულია
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          გასაგრძელებლად შეიყვანეთ პაროლი
        </p>
        <input type="hidden" name="redirect" value={redirectTo} />
        <input
          type="password"
          name="password"
          autoFocus
          required
          placeholder="პაროლი"
          className="mt-6 h-12 w-full rounded-lg border border-slate-300 px-4 text-base focus:border-slate-500 focus:outline-none"
        />
        {hasError && (
          <p className="mt-2 text-sm text-red-600">პაროლი არასწორია</p>
        )}
        <button
          type="submit"
          className="mt-4 h-12 w-full rounded-lg bg-slate-900 px-4 text-base font-medium text-white"
        >
          შესვლა
        </button>
      </form>
    </main>
  );
}
