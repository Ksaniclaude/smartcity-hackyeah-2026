import { rpc } from '@/lib/supabase';
import { listMarkets } from '@/lib/queries';

function cell(v: string | number): string {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  await rpc('app_session', { p_token: null }); // dogania rozliczenia dni
  const rows = await listMarkets({});
  const header = ['id', 'pytanie', 'kategoria', 'status', 'szansa_tak', 'zmiana_7d_pkt', 'typujacy', 'termin', 'wynik'];
  const lines = rows.map((m) =>
    [
      m.id,
      m.question,
      m.category,
      m.phase,
      m.prob.toFixed(3),
      Math.round(m.change7d * 100),
      m.participants,
      new Date(m.closes_at).toISOString().slice(0, 10),
      m.outcome === null ? '' : m.outcome ? 'TAK' : 'NIE',
    ]
      .map(cell)
      .join(','),
  );
  return new Response([header.join(','), ...lines].join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="puls-miasta.csv"',
    },
  });
}
