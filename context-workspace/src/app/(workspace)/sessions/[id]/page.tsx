'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession, useSessionMessages } from '@/lib/query';
import { SessionHeader } from '@/components/session/session-header';
import { SessionMetadata } from '@/components/session/session-metadata';
import { MessageList } from '@/components/session/message-list';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { MessageSkeleton } from '@/components/shared/loading-skeleton';

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: session, isLoading: isLoadingSession, error: sessionError } = useSession(id);
  const { data: messages = [], isLoading: isLoadingMessages } = useSessionMessages(id);

  const handleBack = () => {
    if (session?.projectId) {
      router.push(`/projects/${session.projectId}`);
    } else {
      router.back();
    }
  };

  if (isLoadingSession) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-2">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className="text-xs text-muted-foreground">Loading session workspace...</span>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="text-center py-12 space-y-4">
        <h3 className="font-semibold text-lg text-foreground">Session Not Found</h3>
        <p className="text-muted-foreground text-sm">
          The requested context session could not be retrieved.
        </p>
        <Button onClick={() => router.push('/dashboard')} size="sm" className="bg-indigo-600 hover:bg-indigo-500">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back navigation link */}
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Project</span>
      </button>

      {/* Split layout: Chat stream & Metadata Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Chat Stream Column */}
        <div className="lg:col-span-2 space-y-4">
          <SessionHeader session={session} />
          
          {isLoadingMessages ? (
            <MessageSkeleton />
          ) : (
            <MessageList messages={messages} />
          )}
        </div>

        {/* Metadata Sidebar Column */}
        <div className="lg:col-span-1 lg:sticky lg:top-4">
          <SessionMetadata session={session} />
        </div>
      </div>
    </div>
  );
}
