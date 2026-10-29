/**
 * The `config.json` settings that say what goes in the server's pack stack.
 *
 * The build itself is not optional. Blocks, items, entities and the rest come
 * from the stack on every server, so these keys only add to it and decide what
 * a broken pack does.
 *
 * Read through a `ConfigBuilder` of its own rather than through `Config`,
 * because `Config` reads every key it knows at `enable` time and the content
 * build happens before that. Both builders open the same `config.json` with
 * the same key order, so whichever one writes first, the file comes out the
 * same - these keys used to live in a `config.yaml` of their own, which the
 * server then mistook for a legacy config and converted over `config.json`.
 */
import { configFilePath } from '../config/Config';
import { ConfigBuilder } from '../config/ConfigBuilder';
import { CONFIG_KEY_ORDER } from '../config/JsonConfigTypes';
import type { ContentConfigKey } from '../config/JsonConfigTypes';

/** What each key means, written above it the first time the server adds it to the file. */
const COMMENTS = {
    'content-strict': 'Whether a pack that reports an error stops the server instead of loading short.',
    'content-world-packs': 'Extra behavior pack directories this world loads, after the vanilla ones.',
    'content-datapacks': 'Java datapack directories this world loads, after the vanilla one.'
} as const satisfies Record<ContentConfigKey, string>;

/** What the content settings say. */
export interface ContentSettings {
    /** Whether a pack error stops the server. */
    readonly strict: boolean;
    /** Behavior pack directories the world adds to the stack. */
    readonly worldPacks: readonly string[];
    /** Java datapack directories the world adds to the stack. */
    readonly datapacks: readonly string[];
}

/** Reads the content settings, writing any key the file lacks. */
export const readContentSettings = (): ContentSettings => {
    const config = new ConfigBuilder(configFilePath(), CONFIG_KEY_ORDER);
    const read = <T>(key: keyof typeof COMMENTS, defaults: T): T => config.get(key, defaults, COMMENTS[key]);

    return {
        strict: read('content-strict', false),
        worldPacks: read<string[]>('content-world-packs', []),
        datapacks: read<string[]>('content-datapacks', [])
    };
};
