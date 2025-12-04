import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { sql } from "@codemirror/lang-sql";
import PartySocket from "partysocket";
import { Clipboard, Check } from "phosphor-react";

type FileRecord = {
  name: string;
  content: string;
  updatedAt: number;
};

type ServerMessage =
  | { type: "init"; files: FileRecord[]; latest?: string }
  | { type: "file-update"; file: FileRecord };

const PARTYKIT_HOST =
  import.meta.env.VITE_PARTYKIT_HOST ?? "sql-party-party.bru02.partykit.dev"; //  ?? "127.0.0.1:1999";
const PARTYKIT_ROOM = import.meta.env.VITE_PARTYKIT_ROOM ?? "sql-room";
const PARTYKIT_PARTY = import.meta.env.VITE_PARTYKIT_PARTY ?? "main";
const PARTYKIT_PREFIX = import.meta.env.VITE_PARTYKIT_PREFIX ?? "parties";
const WS_PROTOCOL =
  PARTYKIT_HOST.includes("localhost") || PARTYKIT_HOST.includes("127.0.0.1")
    ? "ws"
    : "wss";

function CodeWorkspace() {
  const [files, setFiles] = useState<Record<string, FileRecord>>({});
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<EditorView | null>(null);

  useEffect(() => {
    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: PARTYKIT_ROOM,
      party: PARTYKIT_PARTY,
      prefix: PARTYKIT_PREFIX,
      protocol: WS_PROTOCOL,
    });

    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const payload: ServerMessage = JSON.parse(event.data);
        if (payload.type === "init") {
          const nextFiles: Record<string, FileRecord> = Object.fromEntries(
            payload.files.map((f) => [f.name, f])
          );
          const sortedNames = [...payload.files]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((f) => f.name);
          setFiles(nextFiles);
          setTabOrder(sortedNames);
          setActiveFile((prev) => prev ?? payload.latest ?? sortedNames[0] ?? null);
          console.log("Initialized with files:", payload.files.map((f) => f.name));
        } else if (payload.type === "file-update") {
          setFiles((prev) => ({ ...prev, [payload.file.name]: payload.file }));
          setTabOrder((prev) =>
            prev.includes(payload.file.name) ? prev : [payload.file.name, ...prev]
          );
          setActiveFile((prev) => prev ?? payload.file.name);
        }
      } catch (err) {
        console.error("Failed to parse server message", err);
      }
    };

    socket.addEventListener("message", handleMessage);

    return () => {
      socket.removeEventListener("message", handleMessage);
      socket.close();
    };
  }, []);

  const tabs = useMemo(
    () => tabOrder.filter((name) => files[name]),
    [tabOrder, files]
  );

  const currentContent =
    activeFile && files[activeFile] ? files[activeFile].content : "";

  useEffect(() => {
    if (!editorRef.current) return;
    replaceDocument(editorRef.current, currentContent, true);
  }, [activeFile]);

  useEffect(() => {
    if (!editorRef.current || !activeFile) return;
    const nextContent = files[activeFile]?.content ?? "";
    const prevContent = editorRef.current.state.doc.toString();
    if (nextContent === prevContent) return;

    applyIncrementalUpdate(editorRef.current, prevContent, nextContent);
  }, [files, activeFile]);

  const extensions = useMemo(
    () => [
      sql(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ tabindex: "0" }),
    ],
    []
  );

  const handleCopy = async () => {
    const content = currentContent;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  return (
    <div className="editor-card">
      <div className="tabbar">
        {tabs.length === 0 && <span className="tab muted">Waiting for files…</span>}
        {tabs.map((name) => (
          <button
            key={name}
            className={`tab ${activeFile === name ? "active" : ""}`}
            onClick={() => setActiveFile(name)}
            title={name}
          >
            <span className="tab-name">{name}</span>
          </button>
        ))}
        <div className="tab-actions">
          <button className="icon-btn" onClick={handleCopy} disabled={!activeFile}>
            <span className={`icon-layer ${copied ? "hidden" : "visible"}`}>
              <Clipboard size={18} weight="bold" />
            </span>
            <span className={`icon-layer ${copied ? "visible" : "hidden"}`}>
              <Check size={18} weight="bold" />
            </span>
          </button>
        </div>
      </div>

      <div className="editor-shell">
        <CodeMirror
          height="100%"
          extensions={extensions}
          onCreateEditor={(view) => {
            console.log("Editor initialized");
            editorRef.current = view;
            replaceDocument(view, currentContent, true);
          }}
        />
      </div>
    </div>
  );
}

function applyIncrementalUpdate(view: EditorView, prev: string, next: string) {
  if (prev === next) return;

  let start = 0;
  const minLength = Math.min(prev.length, next.length);
  while (start < minLength && prev[start] === next[start]) start++;

  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }

  view.dispatch({
    changes: { from: start, to: endPrev, insert: next.slice(start, endNext) },
  });
}

function replaceDocument(view: EditorView, content: string, resetSelection = false) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
    selection: resetSelection ? { anchor: 0 } : undefined,
  });
}

export default CodeWorkspace;
