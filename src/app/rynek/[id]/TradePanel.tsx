'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { buyAction, type FormState } from '@/app/actions';
import { quoteBuy, probYes, type Side } from '@/lib/lmsr';
import { FormMessage } from '@/components/ui';
import { BrickIcon } from '@/components/icons';

const QUICK = [10, 25, 50, 100];
const initial: FormState = { ok: false, message: '' };

export function TradePanel({
  marketId,
  qYes,
  qNo,
  b,
  balance,
  maxBet,
}: {
  marketId: number;
  qYes: number;
  qNo: number;
  b: number;
  balance: number | null;
  maxBet: number;
}) {
  const [side, setSide] = useState<Side>('yes');
  const [amount, setAmount] = useState(25);
  const [state, formAction, pending] = useActionState(buyAction, initial);

  const state0 = { qYes, qNo, b };
  const pYes = probYes(state0);
  const valid = Number.isFinite(amount) && amount >= 1;
  const q = valid ? quoteBuy(state0, side, amount) : null;
  const payout = q ? Math.floor(q.shares) : 0;
  const label = side === 'yes' ? 'TAK' : 'NIE';
  const tooMuch = balance !== null && amount > balance;

  return (
    <section aria-label="Twój typ" className="flex flex-col gap-4 rounded-[20px] border border-line bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[22px] font-bold">Twój typ</h2>
        {balance !== null ? <span className="text-[13px] text-muted">masz {balance}</span> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={side === 'yes'}
          onClick={() => setSide('yes')}
          className={`min-h-14 rounded-[14px] border-2 border-yes text-[17px] font-bold ${
            side === 'yes' ? 'bg-yes text-white' : 'bg-white text-yes'
          }`}
        >
          TAK · {Math.round(pYes * 100)}%
        </button>
        <button
          type="button"
          aria-pressed={side === 'no'}
          onClick={() => setSide('no')}
          className={`min-h-14 rounded-[14px] border-2 border-ink text-[17px] font-bold ${
            side === 'no' ? 'bg-ink text-white' : 'bg-white text-ink'
          }`}
        >
          NIE · {100 - Math.round(pYes * 100)}%
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="amount" className="text-[13px] font-semibold text-muted">
          Ile cegiełek stawiasz?
        </label>
        <div className="grid grid-cols-4 gap-2">
          {QUICK.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={amount === a}
              onClick={() => setAmount(a)}
              className={`min-h-11 rounded-xl border-[1.5px] text-[15px] font-semibold tabular-nums ${
                amount === a ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-ink'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <input
          id="amount"
          type="number"
          min={1}
          max={maxBet}
          step={1}
          value={Number.isFinite(amount) ? amount : ''}
          onChange={(e) => setAmount(Math.floor(Number(e.target.value)))}
          className="min-h-11 rounded-xl border border-line-strong px-3.5 text-[15px] tabular-nums"
        />
      </div>

      {q ? (
        <div className="flex flex-col gap-2.5 rounded-[14px] bg-paper px-4 py-3.5 text-sm">
          <Row label={`Jeśli wynik to ${label}`}>
            <strong>dostajesz {payout}</strong> <span className="text-yes">(+{payout - amount})</span>
          </Row>
          <Row label="Jeśli nie">tracisz {amount}</Row>
          <Row label="Śr. cena udziału">{q.avgPrice.toFixed(2).replace('.', ',')}</Row>
          <Row label="Rynek po Twoim typie">
            {Math.round(q.probBefore * 100)}% → {Math.round(q.probAfter * 100)}% TAK
          </Row>
          <span className="block h-1.5 rounded-full bg-line">
            <span className="block h-1.5 rounded-full bg-yes" style={{ width: `${Math.round(q.probAfter * 100)}%` }} />
          </span>
        </div>
      ) : null}

      {balance === null ? (
        <Link
          href="/logowanie"
          className="flex min-h-14 items-center justify-center rounded-2xl bg-ink text-[17px] font-bold text-white"
        >
          Zaloguj się, żeby typować
        </Link>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="marketId" value={marketId} />
          <input type="hidden" name="side" value={side} />
          <input type="hidden" name="amount" value={amount} />
          <button
            type="submit"
            disabled={pending || !valid || tooMuch || amount > maxBet}
            className="flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-ink text-[17px] font-bold text-white disabled:opacity-50"
          >
            <BrickIcon size={22} className="text-brick-light" />
            {pending ? 'Stawiam…' : tooMuch ? 'Za mało cegiełek' : `Postaw ${amount} na ${label}`}
          </button>
          <FormMessage state={state} />
        </form>
      )}
      <p className="text-center text-[13px] leading-snug text-muted">
        Trafiony udział wypłaca 1 cegiełkę. Trafny typ wbrew tłumowi podnosi też Twój Nos.
      </p>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold tabular-nums">{children}</span>
    </div>
  );
}
