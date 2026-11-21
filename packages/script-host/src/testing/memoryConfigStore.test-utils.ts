/** A config store in memory, for tests of `config` in `@jsprismarine/server` and of the packs that use it. */
import type { AddonConfigStore } from '../host/addonConfig';
import type { ScriptPack } from '../host/pack';

/** A config store in memory: a value per pack directory, and a way to say the file changed. */
export class MemoryConfigStore implements AddonConfigStore {
    public readonly values = new Map<string, unknown>();
    /** Every write, as the pack's name and the value as JSON. */
    public readonly writes: string[] = [];
    public readonly watching = new Map<string, () => void>();
    public read(pack: ScriptPack): unknown {
        return this.values.get(pack.directory);
    }
    public write(pack: ScriptPack, value: unknown): void {
        this.writes.push(`${pack.name} ${JSON.stringify(value)}`);
        this.values.set(pack.directory, value);
        this.watching.get(pack.directory)?.();
    }
    public watch(pack: ScriptPack, changed: () => void): () => void {
        this.watching.set(pack.directory, changed);
        return () => this.watching.delete(pack.directory);
    }
    /** The file changed on disk to a value. */
    public changedOnDisk(pack: ScriptPack, value: unknown): void {
        this.values.set(pack.directory, value);
        this.watching.get(pack.directory)?.();
    }
}
