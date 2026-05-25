'use client';

import React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Terminal, Key, Globe, User, Shield, Check } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure your AI context synchronization and developer accounts."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        {/* Navigation panel */}
        <div className="md:col-span-1 space-y-2">
          <button className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Platform Integrations
          </button>
          <button className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground">
            API Configurations
          </button>
          <button className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground">
            Security & Profile
          </button>
        </div>

        {/* Content panel */}
        <div className="md:col-span-2 space-y-6">
          {/* Chrome Extension */}
          <Card className="border border-border/60 bg-card/45">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-400" />
                <CardTitle className="text-sm font-semibold">Chrome Extension Sync</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Synchronize browser tabs, stack overflow discussions, and research document notes.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Sync Connection Key
                </label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value="••••••••••••••••••••••••••••••••"
                    readOnly
                    className="font-mono text-xs bg-muted/20 border-border select-all"
                  />
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shrink-0">
                    Copy Key
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  Paste this connection key in the Chrome extension settings menu to hook it to this default workspace.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border/20 text-xs font-semibold text-emerald-400 bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10">
                <Check className="w-4 h-4 shrink-0" />
                <span>Extension status: Connected and listening (last sync 4 mins ago)</span>
              </div>
            </CardContent>
          </Card>

          {/* VS Code Plugin */}
          <Card className="border border-border/60 bg-card/45">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-purple-400" />
                <CardTitle className="text-sm font-semibold">VS Code Plugin</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Push terminal history logs, file tabs context, and active code selections.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Workspace Port
                </label>
                <Input
                  type="number"
                  value={8080}
                  readOnly
                  className="font-mono text-xs bg-muted/20 border-border"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border/20 text-xs font-semibold text-zinc-400 bg-zinc-500/5 p-3 rounded-lg border border-zinc-500/10">
                <Check className="w-4 h-4 shrink-0" />
                <span>Plugin status: Inactive (listening on port 8080)</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
