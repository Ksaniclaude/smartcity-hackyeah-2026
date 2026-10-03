import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getViewer } from '@/lib/session';
import { DISTRICTS, GAME } from '@/lib/config';
import { RegisterForm } from '@/components/AuthForms';

export const metadata: Metadata = { title: 'Dołącz' };

export default async function RegisterPage() {
  if (await getViewer()) redirect('/');
  return (
    <main className="mx-auto flex max-w-[440px] flex-col gap-6 px-4 pb-12 pt-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Dołącz do gry</h1>
        <p className="leading-relaxed text-muted">
          Na start dostajesz {GAME.signupGrant} cegiełek, a potem +{GAME.weeklyDrip} co tydzień. Cegiełek nie da się
          kupić ani wypłacić, więc gra się tu wyłącznie o rację i reputację.
        </p>
      </div>
      <RegisterForm districts={DISTRICTS} />
      <p className="text-sm text-muted">
        Masz już konto?{' '}
        <Link href="/logowanie" className="font-semibold text-yes underline">
          Zaloguj się
        </Link>
      </p>
    </main>
  );
}
