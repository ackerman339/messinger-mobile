import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { OutboxEntry } from './message-sync';

const directoryFor = (account: string) => new Directory(Paths.document, 'outbox', account);
export const newMessageId = randomUUID;

function write(account: string, entry: OutboxEntry, name: string) {
  const directory = directoryFor(account);
  directory.create({ intermediates: true, idempotent: true });
  const temporary = new File(directory, `${randomUUID()}.tmp`);
  temporary.create();
  try {
    temporary.write(JSON.stringify(entry));
    temporary.move(new File(directory, name));
  } finally {
    if (temporary.name.endsWith('.tmp') && temporary.exists) temporary.delete();
  }
}

export const outboxStorage = {
  load(account: string): OutboxEntry[] {
    const directory = directoryFor(account);
    if (!directory.exists) return [];
    const entries = new Map<string, OutboxEntry>();
    for (const file of directory.list()) {
      if (!(file instanceof File) || !file.name.endsWith('.json')) continue;
      try {
        const entry = JSON.parse(file.textSync()) as OutboxEntry;
        const current = entries.get(entry.id);
        if (!current || !('failed' in current)) entries.set(entry.id, entry);
      } catch (error) {
        console.error('[messages] entrada local ilegible', error);
      }
    }
    return [...entries.values()];
  },
  save(account: string, entry: OutboxEntry) {
    const file = new File(directoryFor(account), `${entry.id}.json`);
    if (!file.exists) write(account, entry, file.name);
  },
  fail(account: string, entry: OutboxEntry) {
    const file = new File(directoryFor(account), `${entry.id}.failed.json`);
    if (!file.exists) write(account, entry, file.name);
    const pending = new File(directoryFor(account), `${entry.id}.json`);
    if (pending.exists) pending.delete();
  },
  remove(account: string, id: string) {
    const directory = directoryFor(account);
    for (const name of [`${id}.json`, `${id}.failed.json`]) {
      const file = new File(directory, name);
      if (file.exists) file.delete();
    }
  },
};
