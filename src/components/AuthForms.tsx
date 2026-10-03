'use client';

import { useActionState } from 'react';
import { loginAction, registerAction, type FormState } from '@/app/actions';
import { FormMessage } from './ui';

const initial: FormState = { ok: false, message: '' };
const field = 'min-h-12 w-full rounded-xl border border-line-strong bg-white px-3.5 text-base';

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nick" className="text-sm font-semibold">Nick</label>
        <input id="nick" name="nick" required autoComplete="username" className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-semibold">Hasło</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className={field} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-ink text-base font-semibold text-white hover:bg-ink-2 disabled:opacity-50"
      >
        {pending ? 'Loguję…' : 'Zaloguj'}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

export function RegisterForm({ districts }: { districts: readonly string[] }) {
  const [state, action, pending] = useActionState(registerAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nick" className="text-sm font-semibold">Nick</label>
        <input
          id="nick"
          name="nick"
          required
          minLength={3}
          maxLength={20}
          pattern="[a-zA-Z0-9_.]{3,20}"
          autoComplete="username"
          className={field}
          aria-describedby="nick-hint"
        />
        <span id="nick-hint" className="text-xs text-muted">3–20 znaków: litery bez polskich znaków, cyfry, „_” i „.”</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-semibold">Hasło</label>
        <input id="password" name="password" type="password" required minLength={6} autoComplete="new-password" className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="district" className="text-sm font-semibold">Twoja dzielnica</label>
        <select id="district" name="district" required defaultValue="" className={field}>
          <option value="" disabled>Wybierz</option>
          {districts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brick text-base font-semibold text-white hover:bg-[#9a3616] disabled:opacity-50"
      >
        {pending ? 'Zakładam konto…' : 'Załóż konto'}
      </button>
      <FormMessage state={state} />
    </form>
  );
}
