'use client';

import { Suspense, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useWorkspaceStore } from '@/store';

/**
 * Old project URLs (the extension links here, e.g. "Open Ask AI in
 * Dashboard" → /projects/{id}?tab=ask): select the project in the sidebar
 * and send the tab to its new page.
 */
export default function ProjectRedirect() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}

const TAB_ROUTES: Record<string, string> = { ask: '/ask', sessions: '/sessions', notes: '/notes' };

function Redirect() {
  const { id } = useParams<{ id: string }>();
  const tab = useSearchParams().get('tab');
  const router = useRouter();
  const setActiveProject = useWorkspaceStore((s) => s.setActiveProject);

  useEffect(() => {
    setActiveProject(id);
    router.replace(TAB_ROUTES[tab ?? ''] ?? '/notes');
  }, [id, tab, router, setActiveProject]);

  return null;
}
