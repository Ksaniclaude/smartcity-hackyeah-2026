'use client';

import { useActionState } from 'react';
import { proposeAction, voteAction, type FormState } from '@/app/actions';
import { FormMessage } from '@/components/ui';
import { CheckIcon } from '@/components/icons';

const initial: FormState = { ok: false, message: '' };

export function VoteButton({ proposalId, disabled, label }: { proposalId: number; disabled: boolean; label: string }) {
  const [state, action, pending] = useActionState(voteAction, initial);
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="proposalId" value={proposalId} />
      <button
        type="submit"
        disabled={disabled || pending}
        className="flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <CheckIcon size={18} strokeWidth={2} />
        {pending ? 'Głosuję…' : label}
      </button>
      {state.message && !state.ok ? <FormMessage state={state} /> : null}
    </form>
  );
}

export function ProposeForm({
  categories,
  minDate,
  maxDate,
}: {
  categories: readonly string[];
  minDate: string;
  maxDate: string;
}) {
  const [state, action, pending] = useActionState(proposeAction, initial);
  const field = 'min-h-11 w-full rounded-xl border border-line-strong bg-white px-3.5 text-[15px]';
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="question" className="text-sm font-semibold">
          Pytanie (TAK/NIE)
        </label>
        <input
          id="question"
          name="question"
          required
          minLength={12}
          maxLength={140}
          placeholder="Czy nowy most otworzy się przed 1 lipca?"
          className={field}
        />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="category" className="text-sm font-semibold">
            Kategoria
          </label>
          <select id="category" name="category" required className={field} defaultValue="">
            <option value="" disabled>
              Wybierz
            </option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="closesOn" className="text-sm font-semibold">
            Rozstrzygnięcie
          </label>
          <input id="closesOn" name="closesOn" type="date" required min={minDate} max={maxDate} className={field} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="criteria" className="text-sm font-semibold">
          Kiedy wynik to TAK i skąd to sprawdzimy?
        </label>
        <textarea
          id="criteria"
          name="criteria"
          required
          minLength={15}
          maxLength={400}
          rows={3}
          placeholder="TAK, jeśli urząd miasta ogłosi otwarcie mostu dla ruchu przed 1.07."
          className="w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-[15px]"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-xl bg-brick px-5 text-[15px] font-semibold text-white hover:bg-[#9a3616] disabled:opacity-50"
      >
        {pending ? 'Zgłaszam…' : 'Zgłoś propozycję (to Twój dzisiejszy ruch)'}
      </button>
      <FormMessage state={state} />
    </form>
  );
}
