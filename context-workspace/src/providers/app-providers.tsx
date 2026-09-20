'use client';

import React from 'react';
import { QueryProvider } from './query-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from './auth-provider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <QueryProvider>
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </QueryProvider>
    </AuthProvider>
  );
}
