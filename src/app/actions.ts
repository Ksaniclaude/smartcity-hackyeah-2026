'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { GameError, rpc } from '@/lib/supabase';
import { SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from '@/lib/session';
import { bricks, fmtInt, plural } from '@/lib/format';
import type { Side } from '@/lib/lmsr';

export type FormState = { ok: boolean; message: string };

function failure(e: unknown): FormState {
  if (e instanceof GameError) return { ok: false, message: e.message };
  console.error(e);
  return { ok: false, message: 'Coś poszło nie tak. Spróbuj jeszcze raz.' };
}

async function startSession(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
}

// ---------------------------------------------------------------------------
// Konto

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let token: string | null;
  try {
    token = await rpc<string | null>('app_login', { p_nick: text(fd, 'nick'), p_password: text(fd, 'password') });
  } catch (e) {
    return failure(e);
  }
  if (!token) return { ok: false, message: 'Nieprawidłowy nick lub hasło.' };
  await startSession(token);
  redirect('/');
}

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  let token: string;
  try {
    token = await rpc<string>('app_register', {
      p_nick: text(fd, 'nick'),
      p_password: text(fd, 'password'),
      p_district: text(fd, 'district'),
    });
  } catch (e) {
    return failure(e);
  }
  await startSession(token);
  redirect('/dzis');
}

export async function logoutAction() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await rpc('app_logout', { p_token: token });
  store.delete(SESSION_COOKIE);
  redirect('/');
}

// ---------------------------------------------------------------------------
// Gra

export async function buyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const side = text(fd, 'side') as Side;
    const amount = Math.floor(Number(text(fd, 'amount')));
    const q = await rpc<{ shares: number }>('app_buy', {
      p_token: await sessionToken(),
      p_market: Number(text(fd, 'marketId')),
      p_side: side,
      p_amount: amount,
    });
    revalidatePath('/', 'layout');
    return {
      ok: true,
      message: `Postawione: ${bricks(amount)} na ${side === 'yes' ? 'TAK' : 'NIE'}. Masz ${fmtInt(q.shares)} ${plural(
        Math.round(q.shares),
        'udział',
        'udziały',
        'udziałów',
      )}.`,
    };
  } catch (e) {
    return failure(e);
  }
}

export async function proposeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await rpc('app_propose', {
      p_token: await sessionToken(),
      p_question: text(fd, 'question'),
      p_category: text(fd, 'category'),
      p_criteria: text(fd, 'criteria'),
      p_closes_on: text(fd, 'closesOn') || null,
    });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Twoja propozycja jest w grze. Wyniki o północy.' };
  } catch (e) {
    return failure(e);
  }
}

export async function voteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await rpc('app_vote', { p_token: await sessionToken(), p_proposal: Number(text(fd, 'proposalId')) });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Głos oddany. Wyniki o północy.' };
  } catch (e) {
    return failure(e);
  }
}

// ---------------------------------------------------------------------------
// Admin (uprawnienia sprawdza baza)

export async function adminTimeAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await rpc('app_admin_time', { p_token: await sessionToken(), p_mode: text(fd, 'mode') });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Czas gry przesunięty.' };
  } catch (e) {
    return failure(e);
  }
}

export async function adminResolveAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const outcome = text(fd, 'outcome') === 'yes';
    await rpc('app_admin_resolve', {
      p_token: await sessionToken(),
      p_market: Number(text(fd, 'marketId')),
      p_outcome: outcome,
    });
    revalidatePath('/', 'layout');
    return { ok: true, message: `Rozstrzygnięto: ${outcome ? 'TAK' : 'NIE'}. Wypłaty i Nos naliczone.` };
  } catch (e) {
    return failure(e);
  }
}

export async function adminHideProposalAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await rpc('app_admin_hide', { p_token: await sessionToken(), p_proposal: Number(text(fd, 'proposalId')) });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Propozycja ukryta.' };
  } catch (e) {
    return failure(e);
  }
}

export async function adminResetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  if (text(fd, 'confirm') !== 'RESET') return { ok: false, message: 'Wpisz RESET, żeby potwierdzić.' };
  try {
    await rpc('app_admin_reset', { p_token: await sessionToken() });
  } catch (e) {
    return failure(e);
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/logowanie');
}
