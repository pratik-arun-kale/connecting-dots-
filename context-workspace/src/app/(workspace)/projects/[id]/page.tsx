'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProject, useProjectContexts, useProjectSessions } from '@/lib/query';
import { ProjectHeader } from '@/components/project/project-header';
import { SessionTimeline } from '@/components/project/session-timeline';
import { CapturedContextList } from '@/components/project/captured-context-list';
import { NotesSection } from '@/components/project/notes-section';
import { RagQueryPanel } from '@/components/project/rag-query-panel';
import { ConversationSearchPanel } from '@/components/project/conversation-search-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MessageSquare, Bookmark, StickyNote, Loader2, Sparkles } from 'lucide-react';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: project, isLoading: isLoadingProject, error: projectError } = useProject(id);
  const { data: sessions = [], isLoading: isLoadingSessions } = useProjectSessions(id);
  const { data: contexts = [], isLoading: isLoadingContexts } = useProjectContexts(id);

  if (isLoadingProject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-2">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className="text-xs text-muted-foreground">Loading project details...</span>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="text-center py-12 space-y-4">
        <h3 className="font-semibold text-lg text-foreground">Project Not Found</h3>
        <p className="text-muted-foreground text-sm">
          The project you are looking for does not exist or has been deleted.
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
      {/* Back button */}
      <button
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Dashboard</span>
      </button>

      {/* Main Header */}
      <ProjectHeader project={project} />

      {/* Workspace Tabs */}
      <Tabs defaultValue="sessions" className="space-y-4">
        <div className="border-b border-border/40 pb-px">
          <TabsList className="bg-transparent p-0 gap-4 h-10 w-full justify-start rounded-none border-b border-transparent">
            <TabsTrigger
              value="sessions"
              className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-1 pb-2.5 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground border-b-2 border-transparent transition-all cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                Sessions ({sessions.length})
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="contexts"
              className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-1 pb-2.5 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground border-b-2 border-transparent transition-all cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Bookmark className="w-3.5 h-3.5" />
                Captured Context ({contexts.length})
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-1 pb-2.5 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground border-b-2 border-transparent transition-all cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5" />
                Scratchpad & Notes
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="ask"
              className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-indigo-500 rounded-none px-1 pb-2.5 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground data-[state=active]:text-foreground border-b-2 border-transparent transition-all cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Ask AI
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab Contents */}
        <TabsContent value="sessions" className="outline-none pt-2">
          {isLoadingSessions ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-muted/20 border border-border/40 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <SessionTimeline sessions={sessions} />
          )}
        </TabsContent>

        <TabsContent value="contexts" className="outline-none pt-2">
          {isLoadingContexts ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-40 bg-muted/20 border border-border/40 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <CapturedContextList contexts={contexts} />
          )}
        </TabsContent>

        <TabsContent value="notes" className="outline-none pt-2">
          <NotesSection projectId={project.id} />
        </TabsContent>

        <TabsContent value="ask" className="outline-none pt-2 space-y-8">
          <ConversationSearchPanel projectId={project.id} />

          <div className="border-t border-border/40 pt-6">
            <RagQueryPanel
              projectId={project.id}
              chunksIndexed={contexts.length * 3}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
