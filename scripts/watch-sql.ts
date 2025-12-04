#!/usr/bin/env bun
/**
 * Watches for .sql file changes in the current working directory and pushes
 * file contents to the PartyKit relay via a simple HTTP call.
 *
 * Env overrides:
 *  - PARTYKIT_HOST (default: localhost:1999)
 *  - PARTYKIT_PROTOCOL (default: http for localhost, https otherwise)
 *  - PARTYKIT_ROOM (default: sql-room)
 */

import { watch } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

type CliArgs = { host?: string; room?: string; protocol?: string; party?: string; prefix?: string };
type FileEvent = "rename" | "change";

const argv = parseArgs(process.argv.slice(2));

const host =
  argv.host ??
  process.env.PARTYKIT_HOST ??
  "localhost:1999";

const party = argv.party ?? process.env.PARTYKIT_PARTY ?? "main";
const prefix = argv.prefix ?? process.env.PARTYKIT_PREFIX ?? "parties";
const protocol =
  argv.protocol ??
  process.env.PARTYKIT_PROTOCOL ??
  (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https");

const room = argv.room ?? process.env.PARTYKIT_ROOM ?? "sql-room";
const ingestUrl = `${protocol}://${host}/${prefix}/${party}/${room}/ingest`;
const debounceMs = 200;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

console.log(`[watcher] watching *.sql in ${process.cwd()}`);
console.log(`[watcher] sending updates to ${ingestUrl}`);

void primeExistingFiles();
startWatcher();

function startWatcher() {
  // fs.watch with recursive mode works on macOS & Windows (good enough for prototype)
  watch(process.cwd(), { recursive: true }, (event: FileEvent, filename?: string) => {
    if (!filename || !filename.endsWith(".sql")) {
      return;
    }
    const fullPath = path.resolve(process.cwd(), filename);
    if (isIgnoredSql(fullPath)) {
      return;
    }
    queuePush(fullPath);
  });
}

function queuePush(fullPath: string) {
  if (isIgnoredSql(fullPath)) return;

  const existing = pending.get(fullPath);
  if (existing) clearTimeout(existing);

  const handle = setTimeout(() => {
    pending.delete(fullPath);
    void pushFile(fullPath);
  }, debounceMs);

  pending.set(fullPath, handle);
}

async function pushFile(fullPath: string) {
  if (isIgnoredSql(fullPath)) return;

  try {
    const file = Bun.file(fullPath);
    if (!(await file.exists())) return;

    const info = await stat(fullPath);
    const content = await file.text();
    const payload = {
      name: path.relative(process.cwd(), fullPath),
      content,
      updatedAt: info.mtimeMs,
    };

    const res = await fetch(ingestUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`[watcher] failed to push ${payload.name}: ${res.status} ${res.statusText}`);
      return;
    }

    console.log(
      `[watcher] pushed ${payload.name} (${content.length}b @ ${new Date(payload.updatedAt).toISOString()})`
    );
  } catch (err) {
    console.error(`[watcher] error pushing ${fullPath}:`, err);
  }
}

async function primeExistingFiles() {
  const glob = new Bun.Glob("**/*.sql");
  for await (const filePath of glob.scan({ cwd: process.cwd() })) {
    if (isIgnoredSql(filePath)) continue;
    queuePush(path.resolve(process.cwd(), filePath));
  }
}

function parseArgs(args: string[]): CliArgs {
  const out: CliArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--host" || arg === "-h") out.host = args[++i];
    else if (arg === "--room" || arg === "-r") out.room = args[++i];
    else if (arg === "--protocol" || arg === "-p") out.protocol = args[++i];
    else if (arg === "--party") out.party = args[++i];
    else if (arg === "--prefix") out.prefix = args[++i];
  }
  return out;
}

function isIgnoredSql(filePath: string) {
  return path.basename(filePath).startsWith("_");
}
