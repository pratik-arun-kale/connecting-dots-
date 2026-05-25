'use client';

import React, { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Sparkles, Save, Info, Loader2 } from 'lucide-react';

interface NotesSectionProps {
  projectId: string;
}

export function NotesSection({ projectId }: NotesSectionProps) {
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load notes from localStorage on mount (mock persistence)
  useEffect(() => {
    const savedNotes = localStorage.getItem(`notes-${projectId}`);
    if (savedNotes) {
      setNotes(savedNotes);
    } else {
      setNotes('');
    }
  }, [projectId]);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      localStorage.setItem(`notes-${projectId}`, notes);
      setIsSaving(false);
    }, 600);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Local Scratchpad Notes */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Workspace Scratchpad
          </h3>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer text-xs h-8"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1" />
            )}
            <span>Save Notes</span>
          </Button>
        </div>

        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Use this scratchpad to jot down quick notes, todo items, or context outlines for this project. Saving keeps these notes persisted locally in your browser."
          className="min-h-[280px] bg-card/45 border-border focus:ring-1 focus:ring-indigo-500 text-sm resize-none"
        />
      </div>

      {/* AI Summary Placeholder */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>AI summaries</span>
        </h3>
        
        <Card className="border border-indigo-500/20 bg-indigo-500/5">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              Future Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Once the FastAPI backend is connected, an AI agent will analyze this project&rsquo;s sessions and saved contexts to generate structural summaries.
            </p>
            <div className="bg-background/50 border border-border/40 p-3 rounded-lg flex gap-2">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h5 className="text-[11px] font-semibold text-foreground">AI summary details</h5>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Includes key topics, tech stacks identified, coding progress velocity, and auto-generated conceptual maps of your workspace.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
