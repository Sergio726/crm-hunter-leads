'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile, SellerStats } from '@/lib/types';

export function TeamManager({
  members,
  stats,
}: {
  members: Profile[];
  stats: SellerStats[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statById = new Map(stats.map((s) => [s.user_id, s]));
  const pending = members.filter((m) => m.role === 'pending');
  const sellers = members.filter((m) => m.role === 'seller');
  const admins = members.filter((m) => m.role === 'superadmin');

  async function invite(e?: React.FormEvent) {
    e?.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return;
    setBusy('invite');
    setError(null);
    const { error } = await supabase.rpc('invite_member', { p_email: value });
    setBusy(null);
    if (error) return setError(error.message);
    setEmail('');
    router.refresh();
  }

  async function approve(m: Profile) {
    setBusy(m.id);
    setError(null);
    const { error } = await supabase.rpc('invite_member', { p_email: m.email });
    setBusy(null);
    if (error) return setError(error.message);
    router.refresh();
  }

  async function revoke(m: Profile) {
    setBusy(m.id);
    setError(null);
    const { error } = await supabase.rpc('revoke_member', { p_user: m.id });
    setBusy(null);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Invitar */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">Invitar a un vendedor</h2>
        <p className="mt-1 text-xs text-slate-400">
          Se agrega el email a la lista de autorizados. Cuando entre con Google, queda habilitado.
        </p>
        <form onSubmit={invite} className="mt-3 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vendedor@email.com"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={busy === 'invite'}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {busy === 'invite' ? 'Invitando…' : 'Invitar'}
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </section>

      {/* Pendientes de aprobación */}
      {pending.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-800">
            Pendientes de aprobación ({pending.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {pending.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{m.full_name ?? m.email}</p>
                  <p className="text-xs text-slate-400">{m.email}</p>
                </div>
                <button
                  onClick={() => approve(m)}
                  disabled={busy === m.id}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busy === m.id ? '…' : 'Aprobar'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Vendedores */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">Vendedores ({sellers.length})</h2>
        {sellers.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Todavía no hay vendedores activos.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="pb-2 font-medium">Vendedor</th>
                  <th className="pb-2 font-medium">Asignados</th>
                  <th className="pb-2 font-medium">Pendientes</th>
                  <th className="pb-2 font-medium">Ganados</th>
                  <th className="pb-2 font-medium">Contactos (semana)</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((m) => {
                  const s = statById.get(m.id);
                  return (
                    <tr key={m.id} className="border-b border-slate-50">
                      <td className="py-2.5">
                        <p className="font-medium text-slate-800">{m.full_name ?? m.email}</p>
                        <p className="text-xs text-slate-400">{m.email}</p>
                      </td>
                      <td className="py-2.5 text-slate-600">{s?.clients_assigned ?? 0}</td>
                      <td className="py-2.5 text-slate-600">{s?.clients_pending ?? 0}</td>
                      <td className="py-2.5 text-slate-600">{s?.clients_won ?? 0}</td>
                      <td className="py-2.5 text-slate-600">{s?.contacts_this_week ?? 0}</td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => revoke(m)}
                          disabled={busy === m.id}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                        >
                          {busy === m.id ? '…' : 'Revocar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Administradores */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">Administradores ({admins.length})</h2>
        <ul className="mt-3 space-y-1">
          {admins.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                admin
              </span>
              {m.full_name ?? m.email}
              <span className="text-xs text-slate-400">{m.email}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
