'use client';

import { useActionState } from 'react';
import type { FormState } from '@/app/actions';
import { FormMessage } from '@/components/ui';

const initial: FormState = { ok: false, message: '' };

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

const variants = {
  ink: 'bg-ink text-white hover:bg-ink-2',
  yes: 'bg-yes text-white hover:bg-yes-dark',
  outline: 'border border-line-strong bg-white text-ink hover:border-ink',
  brick: 'bg-brick text-white hover:bg-[#9a3616]',
};

export function ActionButton({
  action,
  fields,
  label,
  variant = 'ink',
}: {
  action: Action;
  fields: Record<string, string | number>;
  label: string;
  variant?: keyof typeof variants;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        disabled={pending}
        className={`min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-50 ${variants[variant]}`}
      >
        {pending ? '…' : label}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

export function ResetForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-sm font-semibold">
          Wpisz RESET, żeby wgrać demo od nowa
        </label>
        <input id="confirm" name="confirm" autoComplete="off" className="min-h-11 rounded-xl border border-line-strong px-3.5" />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-xl bg-brick px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Resetuję…' : 'Reset danych demo'}
      </button>
      <FormMessage state={state} />
    </form>
  );
}
