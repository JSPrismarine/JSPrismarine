/**
 * The embedder's side of `config` in `@jsprismarine/server`: a pack's config file, which the
 * server reads, writes and watches, since a script has no file system. The runtime hands the
 * pack the parsed value, writes what the pack gives, and raises `config.afterEvents.change` on
 * the flush after the server says the file changed.
 */
import type { ScriptPack } from './pack';

/** A pack's config file, as the server keeps it. */
export interface AddonConfigStore {
    /**
     * The parsed JSON of the pack's config file, or undefined when there is no file. A file that
     * fails to parse gives the value the last good read gave, and the server logs the failure once.
     */
    read(pack: ScriptPack): unknown;
    /** Rewrites the pack's config file with a value, as JSON. */
    write(pack: ScriptPack, value: unknown): void;
    /**
     * Watches the pack's config file. `changed` may run on any turn of the event loop, and the
     * runtime reads the file and raises the pack's event on its next flush.
     * @returns Stops the watch.
     */
    watch(pack: ScriptPack, changed: () => void): () => void;
}
