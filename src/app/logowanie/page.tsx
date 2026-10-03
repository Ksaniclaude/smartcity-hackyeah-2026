import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getViewer } from '@/lib/session';
import { LoginForm } from '@/components/AuthForms';

export const metadata: Metadata = { title: 'Logowanie' };

export default async function LoginPage() {
  if (await getViewer()) redirect('/');
  return (
    <main className="mx-auto flex max-w-[440px] flex-col gap-6 px-4 pb-12 pt-12">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Zaloguj się</h1>
      <LoginForm />
      <p className="text-sm text-muted">
        Nie masz konta?{' '}
        <Link href="/rejestracja" className="font-semibold text-yes underline">
          Dołącz
        </Link>
      </p>
    </main>
  );
}
