'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { useThemeStore } from '@/store/theme-store';
import { cn } from '@/lib/utils';
// BlockNote's JS doesn't import its own stylesheet — without this the editor
// renders unstyled (no heading sizes, list markers, block handles). Must come
// before note-editor.css so the overrides there win.
import '@blocknote/shadcn/style.css';
import './note-editor.css';

const AUTOSAVE_DEBOUNCE_MS = 800;

export interface NoteEditorHandle {
  /** Saves any pending edit now (skipping the debounce) and resolves once
   *  the consumer's save has finished. No-op if nothing is pending. */
  flush: () => Promise<void>;
  focus: () => void;
}

interface NoteEditorProps {
  /** Existing note body, as Markdown — parsed into blocks once on mount. */
  initialMarkdown?: string | null;
  /** Called with the content serialized to Markdown (the only format the
   *  backend's content_md understands): 800ms after the last edit, on blur,
   *  on flush(), and on unmount if an edit is still pending. */
  onDebouncedChange: (markdown: string) => void | Promise<void>;
  editable?: boolean;
  placeholder?: string;
  handleRef?: Ref<NoteEditorHandle>;
  className?: string;
}

export function NoteEditor({
  initialMarkdown,
  onDebouncedChange,
  editable = true,
  placeholder,
  handleRef,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // The consumer's callback can change identity every render; read it
  // through a ref so the unmount cleanup below always sees the latest one.
  const onChangeRef = useRef(onDebouncedChange);
  useEffect(() => { onChangeRef.current = onDebouncedChange; }, [onDebouncedChange]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot of the blocks at the last edit. Serializing from a snapshot
  // (not editor.document) keeps the unmount flush working after the view
  // has been torn down.
  const pendingBlocksRef = useRef<typeof editor.document | null>(null);

  const flush = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const blocks = pendingBlocksRef.current;
    if (!blocks) return;
    pendingBlocksRef.current = null;
    await onChangeRef.current(editor.blocksToMarkdownLossy(blocks));
  }, [editor]);

  useImperativeHandle(handleRef, () => ({ flush, focus: () => editor.focus() }), [flush, editor]);

  const handleChange = useCallback(() => {
    if (initializingRef.current) return;
    pendingBlocksRef.current = editor.document;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
  }, [editor, flush]);

  useEffect(() => () => { void flush(); }, [flush]);

  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={theme}
      onChange={handleChange}
      onBlur={() => void flush()}
      className={cn('bn-note-editor', className)}
    />
  );
}
