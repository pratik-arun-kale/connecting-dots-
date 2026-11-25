'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { extractErrorMessage } from '@/lib/api/error-message';
import { authService } from '@/lib/api/services/auth.service';
import { useAuthStore } from '@/store/auth-store';
import { toast } from '@/store/toast-store';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border py-6 first:pt-2 last:border-b-0">
      <h2 className="mb-3 text-[15px] font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const leave = () => {
    clearSession();
    queryClient.clear(); // nothing of this account stays cached in the tab
    router.push('/login');
  };

  const resend = async () => {
    setSending(true);
    try {
      await authService.requestVerification();
      toast(`Sent. Check ${user?.email ?? 'your inbox'}.`);
    } catch (err) {
      toast(extractErrorMessage(err, 'Could not send the email. Try again.'), { tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  const logoutEverywhere = async () => {
    setSigningOut(true);
    try {
      await authService.logoutAll();
      leave();
    } catch (err) {
      toast(extractErrorMessage(err, 'Could not sign out everywhere. Try again.'), { tone: 'error' });
      setSigningOut(false);
    }
  };

  return (
    <>
      <PageHeader>
        <span className="text-foreground">Settings</span>
      </PageHeader>
      <PageBody className="pt-8">
        <h1 className="mb-6 font-note text-[2rem] font-medium tracking-tight text-foreground">Settings</h1>
        <Section title="Account">
          <p className="text-sm text-foreground">{user?.email}</p>
          {user?.email_verified_at ? (
            <p className="mt-1 text-[13px] text-muted-foreground">Email confirmed.</p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-muted-foreground">Email not confirmed yet.</p>
              <Button variant="outline" size="sm" onClick={resend} disabled={sending}>
                {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send the link again
              </Button>
            </div>
          )}
        </Section>

        <Section title="Sessions">
          <p className="mb-3 text-[13px] text-muted-foreground">
            Signs you out on every browser and device, including this one and the extension.
          </p>
          <Button variant="outline" size="sm" onClick={logoutEverywhere} disabled={signingOut}>
            {signingOut && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Log out of all devices
          </Button>
        </Section>

        <Section title="Delete account">
          <p className="mb-3 text-[13px] text-muted-foreground">
            Deletes your account, every project, note and captured conversation, and their search index. This
            can&apos;t be undone.
          </p>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete my account
          </Button>
        </Section>

        <Section title="Legal">
          <p className="text-[13px]">
            <Link href="/privacy" className="underline underline-offset-2 hover:no-underline">Privacy policy</Link>
            {' · '}
            <Link href="/terms" className="underline underline-offset-2 hover:no-underline">Terms</Link>
          </p>
        </Section>
      </PageBody>

      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onDeleted={leave} />
    </>
  );
}

function DeleteAccountDialog({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const close = () => {
    if (deleting) return;
    setPassword('');
    setError(null);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleting(true);
    setError(null);
    try {
      await authService.deleteAccount(password);
      toast('Your account and everything in it were deleted.');
      onDeleted();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not delete the account. Try again.'));
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            Every project, note and captured conversation is deleted for good, including the Trash. Type your password
            to confirm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            aria-label="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={close} disabled={deleting}>Cancel</Button>
            <Button type="submit" variant="destructive" size="sm" disabled={!password || deleting}>
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Delete everything
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
