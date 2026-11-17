import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

/** The centred card the sign-in, reset and verification pages share. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4">
      <Card className="w-full max-w-sm border-border bg-white p-8">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-[#0f172a]">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </Card>
    </div>
  );
}

export function AuthNotice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const styles =
    tone === 'error'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-600'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700';
  const Icon = tone === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs ${styles}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export const authInputClass =
  'bg-muted/30 border-border focus:border-[#4f46e5] text-sm focus:ring-1 focus:ring-[#4f46e5]/30';
export const authLabelClass = 'text-xs font-semibold text-muted-foreground uppercase tracking-wider';
export const authButtonClass = 'w-full bg-[#0f172a] hover:bg-[#1e293b] text-white cursor-pointer';
export const authLinkClass = 'font-medium text-[#4f46e5] hover:underline';
