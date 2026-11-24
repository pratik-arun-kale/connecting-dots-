'use client';

import React from 'react';
import { QueryProvider } from './query-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from './auth-provider';
import { ThemeProvider } from './theme-provider';
import { ServerWakingNotice } from '@/components/ui/server-waking-notice';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ServerWakingNotice />
      <AuthProvider>
        <QueryProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </QueryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
