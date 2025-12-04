import { Activity, useEffect, useState } from "react";
import mermaid from "mermaid";
import TasksOne from "./tasks/1.mdx";
import TasksTwo from "./tasks/2.mdx";
import TipsDoc from "./tasks/tips.mdx";
import CodeWorkspace from "./components/CodeWorkspace";
import "./App.css";

type Page = "tasks" | "code" | "tips";
const NAV_ITEMS: { id: Page; label: string }[] = [
  { id: "tasks", label: "Tasks" },
  { id: "code", label: "Code along" },
  { id: "tips", label: "Tips" },
];
const TASK_STORAGE_KEY = "task-progress";

function App() {
  const [page, setPage] = useState<Page>("tasks");
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
        <CodeWorkspace />
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

export default App;
