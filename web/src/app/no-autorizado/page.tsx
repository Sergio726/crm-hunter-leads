import { LogoutButton } from '@/components/LogoutButton';

export default function NoAutorizadoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
          🔒
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Acceso restringido</h1>
        <p className="mt-2 text-sm text-slate-500">
          Este panel es solo para administradores. Tu cuenta no tiene permisos de superadmin.
        </p>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
