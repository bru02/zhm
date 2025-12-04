import { Activity, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { sql } from "@codemirror/lang-sql";
import mermaid from "mermaid";
import PartySocket from "partysocket";
import { Clipboard, Check } from "phosphor-react";
import TasksOne from "./tasks/1.mdx";
import TasksTwo from "./tasks/2.mdx";
import TipsDoc from "./tasks/tips.mdx";
import "./App.css";

type FileRecord = {
  name: string;
  content: string;
  updatedAt: number;
};

type ServerMessage =
  | { type: "init"; files: FileRecord[]; latest?: string }
  | { type: "file-update"; file: FileRecord };

const PARTYKIT_HOST =
  import.meta.env.VITE_PARTYKIT_HOST ?? "127.0.0.1:1999";
const PARTYKIT_ROOM = import.meta.env.VITE_PARTYKIT_ROOM ?? "sql-room";
const PARTYKIT_PARTY = import.meta.env.VITE_PARTYKIT_PARTY ?? "main";
const PARTYKIT_PREFIX = import.meta.env.VITE_PARTYKIT_PREFIX ?? "parties";
const WS_PROTOCOL =
  PARTYKIT_HOST.includes("localhost") || PARTYKIT_HOST.includes("127.0.0.1")
    ? "ws"
    : "wss";

type Page = "tasks" | "code" | "tips";
const NAV_ITEMS: { id: Page; label: string }[] = [
  { id: "tasks", label: "Tasks" },
  { id: "code", label: "Code along" },
  { id: "tips", label: "Tips" },
];
const TASK_STORAGE_KEY = "task-progress";

function App() {
  const [page, setPage] = useState<Page>("tasks");
  const [files, setFiles] = useState<Record<string, FileRecord>>({});
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<EditorView | null>(null);
  const lastContentRef = useRef<string>("");
  const [taskChecks, setTaskChecks] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(TASK_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (err) {
      console.error("Failed to read task storage", err);
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(taskChecks));
  }, [taskChecks]);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: {
        primaryColor: "#fbfdf4",
        primaryBorderColor: "#c5d92c",
        primaryTextColor: "#2f3a1a",
        lineColor: "#c5d92c",
        secondaryColor: "#e5edb8",
        tertiaryColor: "#f7f9e6",
        edgeLabelBackground: "#ffffff",
        background: "#ffffff",
      },
    });
  }, []);

  useEffect(() => {
    if (page !== "tasks" && page !== "tips") return;

    mermaid
      .run({ querySelector: ".markdown .mermaid" })
      .catch((err) => console.error("Mermaid render failed", err));
  }, [page]);

  useEffect(() => {
    const items = Array.from(
      document.querySelectorAll<HTMLLIElement>(".markdown .task-list-item")
    );
    const cleanups: Array<() => void> = [];

    items.forEach((item, idx) => {
      const checkbox = item.querySelector<HTMLInputElement>('input[type="checkbox"]');
      const rawText = item.textContent?.trim();
      if (!checkbox || !rawText) return;
      const taskKey = `${rawText}-${idx}`;
      const syncCheckedClass = () => {
        item.classList.toggle("is-checked", checkbox.checked);
      };

      if (!item.querySelector(".task-body")) {
        const body = document.createElement("span");
        body.className = "task-body";
        Array.from(item.childNodes).forEach((node) => {
          if (node === checkbox) return;
          body.appendChild(node);
        });
        item.innerHTML = "";
        item.appendChild(checkbox);
        item.appendChild(body);
      }

      checkbox.checked = Boolean(taskChecks[taskKey]);
      syncCheckedClass();
      checkbox.removeAttribute("disabled");
      checkbox.tabIndex = 0;

      const onClick = (ev: Event) => {
        const target = ev.target;
        if (target === checkbox) return;
        if (target instanceof Element && target.closest(".download-link")) return;
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const onChange = () => {
        syncCheckedClass();
        setTaskChecks((prev) => ({
          ...prev,
          [taskKey]: checkbox.checked,
        }));
      };

      item.addEventListener("click", onClick);
      checkbox.addEventListener("change", onChange);
      cleanups.push(() => item.removeEventListener("click", onClick));
      cleanups.push(() => checkbox.removeEventListener("change", onChange));
    });

    return () => cleanups.forEach((fn) => fn());
  }, [page, taskChecks]);

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
        } else if (payload.type === "file-update") {
          setFiles((prev) => ({ ...prev, [payload.file.name]: payload.file }));
          setTabOrder((prev) =>
            prev.includes(payload.file.name)
              ? prev
              : [payload.file.name, ...prev]
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
    lastContentRef.current = currentContent;
    replaceDocument(editorRef.current, currentContent, true);
  }, [activeFile]);

  useEffect(() => {
    if (!editorRef.current || !activeFile) return;
    const nextContent = files[activeFile]?.content ?? "";
    if (nextContent === lastContentRef.current) return;

    applyIncrementalUpdate(editorRef.current, lastContentRef.current, nextContent);
    lastContentRef.current = nextContent;
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
    <div className="page">
      <header className="header">
        <div className="brand">
          <p className="eyebrow">DSC</p>
          <h1>
            SQL ZHMaxxing <sup>™</sup>
          </h1>
        </div>
        <nav className="nav" aria-label="Page navigation">
          {NAV_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              className={`nav-link ${page === id ? "active" : ""}`}
              onClick={() => setPage(id)}
              type="button"
            >
              {label}
            </button>
          ))}

          <a
            href="https://github.com/bru02/database-systems"
            className="nav-link"
            target="_blank"
          >GitHub</a>
        </nav>
      </header>

      <Activity mode={page === "tasks" ? "visible" : "hidden"} name="tasks">
        <article className="markdown-card" aria-label="Tasks">
          <div className="markdown">
            <TasksTwo />
            <TasksOne />
          </div>
        </article>
      </Activity>

      <Activity mode={page === "code" ? "visible" : "hidden"} name="code">
        <div className="editor-card">
          <div className="tabbar">
            {tabs.length === 0 && (
              <span className="tab muted">Waiting for files…</span>
            )}
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
              <button
                className="icon-btn"
                onClick={handleCopy}
                disabled={!activeFile}
              >
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
                editorRef.current = view;
                lastContentRef.current = currentContent;
              }}
            />
          </div>
        </div>
      </Activity>

      <Activity mode={page === "tips" ? "visible" : "hidden"} name="tips">
        <article className="markdown-card" aria-label="Tips">
          <div className="markdown">
            <TipsDoc />
          </div>
        </article>
      </Activity>
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

export default App;
