"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, highlightActiveLine, keymap } from "@codemirror/view";
import { EditorState, Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { foldGutter, indentOnInput, bracketMatching, foldKeymap } from "@codemirror/language";
import { closeBrackets, autocompletion, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { useWorkspace } from "@/contexts/workspace-context";
import { X, Save, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserButtonWithClear } from "@/components/auth/user-button-with-clear";
import { CommandsButton } from "@/components/layout/commands-button";

// Custom theme matching matte black background
const customTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    height: "100%",
  },
  ".cm-content": {
    backgroundColor: "transparent",
    color: "oklch(0.95 0 0)",
    fontFamily: "'JetBrains Mono', 'Monaco', 'Courier New', monospace",
    fontSize: "14px",
    padding: "16px",
    minHeight: "100%",
  },
  ".cm-editor": {
    backgroundColor: "transparent",
    height: "100%",
  },
  ".cm-scroller": {
    backgroundColor: "transparent",
    overflow: "auto",
  },
  ".cm-gutters": {
    backgroundColor: "oklch(0.12 0 0)",
    border: "none",
    color: "oklch(0.6 0 0)",
  },
  ".cm-lineNumbers .cm-lineNumber": {
    color: "oklch(0.6 0 0)",
    minWidth: "3ch",
  },
  ".cm-activeLine": {
    backgroundColor: "oklch(0.12 0 0)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "oklch(0.12 0 0)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "oklch(0.25 0 0)",
  },
  ".cm-cursor": {
    borderLeftColor: "oklch(0.95 0 0)",
    borderLeftWidth: "2px",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-selectionMatch": {
    backgroundColor: "oklch(0.2 0 0)",
  },
  ".cm-focused .cm-selectionMatch": {
    backgroundColor: "oklch(0.25 0 0)",
  },
}, { dark: true });

export function CodeMirrorEditor() {
  const { editorState, updateEditorContent, closeEditor, saveEditor } = useWorkspace();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Detect language from file extension
  const detectedLanguage = useMemo(() => {
    if (!editorState.filePath) return null;
    const ext = editorState.filePath.substring(editorState.filePath.lastIndexOf(".")).toLowerCase();
    
    if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") {
      return javascript({ jsx: ext === ".jsx" });
    }
    if (ext === ".ts" || ext === ".tsx") {
      return javascript({ typescript: true, jsx: ext === ".tsx" });
    }
    if (ext === ".json") {
      return json();
    }
    if (ext === ".md" || ext === ".markdown") {
      return markdown();
    }
    if (ext === ".html" || ext === ".htm") {
      return html();
    }
    if (ext === ".css") {
      return css();
    }
    if (ext === ".py") {
      return python();
    }
    return null;
  }, [editorState.filePath]);

  // Base extensions
  const baseExtensions: Extension[] = useMemo(() => [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
    ]),
    customTheme,
  ], []);

  // Language-specific extensions
  const extensions: Extension[] = useMemo(() => {
    const langExt = detectedLanguage ? [detectedLanguage] : [];
    return [...baseExtensions, ...langExt];
  }, [baseExtensions, detectedLanguage]);

  // Initialize editor
  useEffect(() => {
    if (!editorRef.current || !editorState.isOpen) return;

    // Destroy existing view if it exists
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    // Update listener extension
    const updateListenerExtension = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const content = update.state.doc.toString();
        updateEditorContent(content);
      }
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: editorState.currentContent || "",
        extensions: [...extensions, updateListenerExtension],
      }),
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [editorState.isOpen, editorState.filePath, extensions, updateEditorContent]);

  // Update editor content when it changes externally
  useEffect(() => {
    if (!viewRef.current || !editorState.isOpen) return;
    
    const currentContent = viewRef.current.state.doc.toString();
    const newContent = editorState.currentContent || "";
    
    // Only update if content actually changed and new content is not empty
    // This prevents clearing the editor during streaming updates
    if (currentContent !== newContent && newContent.length > 0) {
      const transaction = viewRef.current.state.update({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: newContent,
        },
      });
      viewRef.current.dispatch(transaction);
    }
  }, [editorState.currentContent, editorState.isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus("saving");
    try {
      await saveEditor();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      setSaveStatus("error");
      console.error("Error saving:", error);
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  if (!editorState.isOpen) {
    return null;
  }

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-sidebar">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Save Button - moved to left */}
          <button
            onClick={handleSave}
            disabled={isSaving || !editorState.hasUnsavedChanges}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              "bg-primary/20 text-primary border border-primary/30",
              "hover:bg-primary/30 hover:border-primary/50",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "flex items-center gap-1.5"
            )}
          >
            <Save className="h-3 w-3" />
            Save
          </button>

          {/* Save Status */}
          {saveStatus === "saving" && (
            <span className="text-xs text-muted-foreground">Saving...</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <XCircle className="h-3 w-3" />
              Error
            </span>
          )}

          {/* File name */}
          <span className="text-sm font-medium text-foreground truncate">
            {editorState.filePath?.split("/").pop() || "Editor"}
          </span>
          {editorState.hasUnsavedChanges && (
            <span className="text-xs text-muted-foreground">•</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Commands Button (Cheat Sheet) */}
          <CommandsButton />
          
          {/* User Button */}
          <UserButtonWithClear />
          
          {/* Close Button */}
          <button
            onClick={closeEditor}
            className="p-1.5 rounded-md hover:bg-accent/50 transition-colors"
            title="Close editor"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        <div ref={editorRef} className="h-full w-full" />
      </div>
    </div>
  );
}

