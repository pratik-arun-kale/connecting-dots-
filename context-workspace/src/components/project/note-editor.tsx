'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { useThemeStore } from '@/store/theme-store';
import { cn } from '@/lib/utils';
import './note-editor.css';

const AUTOSAVE_DEBOUNCE_MS = 800;

interface NoteEditorProps {
  /** Existing note body, as Markdown — parsed into blocks once on mount. */
  initialMarkdown?: string | null;
  /** Fires 800ms after the last edit, and immediately on blur, with the
   *  editor's current content serialized back to Markdown (the only wire
   *  format the backend's content_md column understands). May return a
   *  Promise — `onBlur` waits for it before firing, so a consumer that
   *  collapses/resets its own state on blur (like the composer) does so
   *  only after the flush actually lands, not mid-flight. */
  onDebouncedChange: (markdown: string) => void | Promise<void>;
  editable?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  className?: string;
}

export function NoteEditor({
  initialMarkdown,
  onDebouncedChange,
  editable = true,
  placeholder,
  autoFocus,
  onBlur,
  className,
}: NoteEditorProps) {
  const theme = useThemeStore((s) => s.theme);
  const editor = useCreateBlockNote({
    placeholders: placeholder ? { default: placeholder, emptyDocument: placeholder } : undefined,
  });

  // Markdown -> blocks needs a live editor instance to parse against (the
  // parser is schema-aware), so the initial content can't be passed as
  // `initialContent` at creation time — it's loaded imperatively once here.
  const loadedRef = useRef(false);
  const initializingRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const trimmed = initialMarkdown?.trim();
    if (trimmed) {
      const blocks = editor.tryParseMarkdownToBlocks(trimmed);
      if (blocks.length > 0) {
        // Suppresses the onChange this replace itself triggers — otherwise
        // every mount (e.g. expanding an existing note) would immediately
        // schedule a redundant no-op autosave of the content it just loaded.
        initializingRef.current = true;
        editor.replaceBlocks(editor.document, blocks);
        initializingRef.current = false;
      }
    }
    if (autoFocus) editor.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    return onDebouncedChange(editor.blocksToMarkdownLossy(editor.document));
  }, [editor, onDebouncedChange]);

  const handleChange = useCallback(() => {
    if (initializingRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
  }, [flush]);

  const handleBlur = useCallback(() => {
    Promise.resolve(flush()).finally(() => onBlur?.());
  }, [flush, onBlur]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={theme}
      onChange={handleChange}
      onBlur={handleBlur}
      className={cn('bn-note-editor', className)}
    />
  );
}
