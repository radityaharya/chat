import { useCallback, useEffect, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { vitesseBlack } from 'codemirror-theme-vitesse'
import { EditorView } from "@codemirror/view";
import { type Extension } from "@codemirror/state";

// Language imports
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";

interface CodeMirrorEditorProps {
  code: string;
  language: string;
  showLineNumbers?: boolean;
  onChange?: (code: string) => void;
  autoFocus?: boolean;
}

// Map language strings to CodeMirror language extensions
function getLanguageExtension(language: string): Extension[] {
  const lang = language.toLowerCase();

  switch (lang) {
    case "javascript":
    case "js":
      return [javascript()];
    case "typescript":
    case "ts":
      return [javascript({ typescript: true })];
    case "jsx":
      return [javascript({ jsx: true })];
    case "tsx":
      return [javascript({ jsx: true, typescript: true })];
    case "python":
    case "py":
    case "python3":
      return [python()];
    case "html":
      return [html()];
    case "css":
      return [css()];
    case "json":
      return [json()];
    case "markdown":
    case "md":
      return [markdown()];
    case "rust":
    case "rs":
      return [rust()];
    case "go":
    case "golang":
      return [go()];
    case "cpp":
    case "c++":
    case "c":
      return [cpp()];
    case "java":
      return [java()];
    case "sql":
      return [sql()];
    case "xml":
      return [xml()];
    case "yaml":
    case "yml":
      return [yaml()];
    case "bash":
    case "sh":
    case "shell":
    case "zsh":
      // No specific bash extension, use plain text
      return [];
    default:
      return [];
  }
}

// Custom theme extensions for terminal-like appearance
const customTheme = EditorView.theme({
  "&": {
    fontSize: "13px",
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  },
  ".cm-content": {
    padding: "16px 0",
    caretColor: "#22c55e", // terminal-green
  },
  ".cm-gutters": {
    backgroundColor: "#0d0d0d",
    borderRight: "1px solid rgba(255,255,255,0.1)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(34, 197, 94, 0.2) !important", // terminal-green with transparency
  },
  ".cm-cursor": {
    borderLeftColor: "#22c55e",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

export default function CodeMirrorEditor({
  code,
  language,
  showLineNumbers = false,
  onChange,
  autoFocus = false,
}: CodeMirrorEditorProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const handleChange = useCallback((value: string) => {
    onChange?.(value);
  }, [onChange]);

  // Auto-focus the editor
  useEffect(() => {
    if (autoFocus && editorRef.current?.view) {
      editorRef.current.view.focus();
    }
  }, [autoFocus]);

  const extensions = [
    customTheme,
    EditorView.lineWrapping,
    ...getLanguageExtension(language),
  ];

  return (
    <CodeMirror
      ref={editorRef}
      value={code}
      onChange={handleChange}
      theme={vitesseBlack}
      extensions={extensions}
      basicSetup={{
        lineNumbers: showLineNumbers,
        foldGutter: false,
        dropCursor: true,
        allowMultipleSelections: true,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false, // Disable autocomplete for simpler UX
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        syntaxHighlighting: true,
      }}
      className="min-h-[200px] [&_.cm-editor]:outline-none"
    />
  );
}
