import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { getUser, signOut } from '../local/auth';

/** Avatar + email with a sign-out action. `wipe` also removes this device's local copy (shared computers). */
export function UserMenu({ className = '', up = false }: { className?: string; up?: boolean }) {
  const u = getUser();
  const [open, setOpen] = useState(false);
  if (!u) return null;
  return (
    <div className={`relative ${className}`}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 rounded-full" aria-label="Account menu" title={u.email}>
        {u.picture ? <img src={u.picture} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full" /> : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400 text-xs font-bold text-slate-900">{(u.name || u.email)[0]?.toUpperCase()}</span>}
      </button>
      {open && (<>
        <button aria-label="Close" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
        <div className={`absolute z-50 w-64 ${up ? 'bottom-full left-0 mb-2' : 'right-0 mt-2'} rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-800 shadow-xl`}>
          <p className="truncate font-semibold">{u.name}</p><p className="truncate text-xs text-slate-500">{u.email}</p>
          <button className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50" onClick={() => void signOut(false)}><LogOut size={15} />Sign out</button>
          <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => confirm('Sign out and delete this device’s local copy? Your encrypted Drive vault is kept. Anything not yet synced is lost.') && void signOut(true)}><LogOut size={15} />Sign out & remove data from this device</button>
        </div>
      </>)}
    </div>
  );
}
