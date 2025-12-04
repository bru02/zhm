import type * as Party from "partykit/server";

type FileRecord = {
  name: string;
  content: string;
  updatedAt: number;
};

type ServerMessage =
  | { type: "init"; files: FileRecord[]; latest?: string }
  | { type: "file-update"; file: FileRecord };

const ONE_HOUR = 3 * 60 * 60 * 1000;

export default class Server implements Party.Server {
  private files: Map<string, FileRecord> = new Map();
  private loadPromise: Promise<void> | null = null;

  constructor(readonly room: Party.Room) {}

  private async ensureLoaded() {
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        const stored = await this.room.storage.get<FileRecord[]>("files");
        if (Array.isArray(stored)) {
          const now = Date.now();
          stored.forEach((file) => {
            if (file && file.name && typeof file.content === "string") {
              if (now - file.updatedAt <= ONE_HOUR) {
                this.files.set(file.name, file);
              }
            }
          });
          this.prune(now);
        }
      })();
    }
    return this.loadPromise;
  }

  private async persist() {
    const list: FileRecord[] = [];
    this.files.forEach((file) => list.push(file));
    await this.room.storage.put("files", list);
  }

  private prune(now: number = Date.now()) {
    this.files.forEach((file, name) => {
      if (now - file.updatedAt > ONE_HOUR) {
        this.files.delete(name);
      }
    });
  }

  private serializeFiles(): FileRecord[] {
    const now = Date.now();
    this.prune(now);
    const list: FileRecord[] = [];
    this.files.forEach((file) => list.push(file));
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private broadcastUpdate(file: FileRecord) {
    const message: ServerMessage = { type: "file-update", file };
    this.room.broadcast(JSON.stringify(message));
  }

  private async handleIngest(request: Request) {
    await this.ensureLoaded();

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let payload: Partial<FileRecord>;
    try {
      payload = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const name = payload.name?.toString().trim();
    const content =
      typeof payload.content === "string" ? payload.content : undefined;
    const updatedAt = Number.isFinite(payload.updatedAt)
      ? Number(payload.updatedAt)
      : Date.now();

    if (!name || content === undefined) {
      return new Response("Missing name or content", { status: 400 });
    }

    const record: FileRecord = { name, content, updatedAt };
    this.files.set(name, record);
    this.prune(updatedAt);
    await this.persist();
    this.broadcastUpdate(record);

    return Response.json({ ok: true, stored: record });
  }

  private async handlePrune(request: Request) {
    if (request.method !== "POST" && request.method !== "DELETE") {
      return new Response("Method not allowed", { status: 405 });
    }

    const removed = this.files.size;
    this.files.clear();
    await this.persist();

    const message: ServerMessage = { type: "init", files: [] };
    this.room.broadcast(JSON.stringify(message));

    return Response.json({ ok: true, pruned: removed });
  }

  async onRequest(request) {
    await this.ensureLoaded();

    const { pathname } = new URL(request.url);
    const segments = pathname.split("/").filter(Boolean);
    const roomIndex = segments.indexOf(this.room.id);
    const pathAfterRoom =
      roomIndex >= 0
        ? segments.slice(roomIndex + 1).join("/") // portion after room id
        : pathname;

    if (pathAfterRoom === "ingest") {
      return this.handleIngest(request);
    }

    if (pathAfterRoom === "prune") {
      return this.handlePrune(request);
    }

    if (request.method === "GET" && (pathAfterRoom === "" || pathAfterRoom === "state")) {
      const files = this.serializeFiles();
      return Response.json({
        files,
        latest: files[0]?.name ?? null,
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async onConnect(conn: Party.Connection) {
    await this.ensureLoaded();
    const files = this.serializeFiles();
    const message: ServerMessage = {
      type: "init",
      files,
      latest: files[0]?.name,
    };
    conn.send(JSON.stringify(message));
  }
}

Server satisfies Party.Worker;
