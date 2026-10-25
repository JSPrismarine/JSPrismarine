/**
 * The `config.yaml` settings that decide whether the server builds its
 * content from packs, and what goes in the stack.
 *
 * Read through a `ConfigBuilder` of its own rather than through `Config`,
 * because `Config` reads every key it knows at `enable` time and the content
 * build happens before that. Writing a default back into the file works the
 * same way either way, so a server that has never seen these keys gains them
 * with their comments the first time it starts.
 */
import { ConfigBuilder } from '../config/ConfigBuilder';
import { withCwd } from '../utils/cwd';

const FILE_NAME = 'config.yaml';

/** Turns the content build on without touching `config.yaml`, which is what the tests use. */
export const CONTENT_ENABLED_ENV = 'JSP_CONTENT';

/** What each key means, written above it the first time the server adds it to the file. */
const COMMENTS = {
    'content-packs':
        'Whether blocks, items, entities and the rest are built from the pack stack at startup. Off while the subsystems migrate.',
    'content-strict': 'Whether a pack that reports an error stops the server instead of loading short.',
    'content-world-packs': 'Extra behavior pack directories this world loads, after the vanilla ones.',
    'content-datapacks': 'Java datapack directories this world loads, after the vanilla one.'
} as const satisfies Record<string, string>;

/** What the content settings say. */
export interface ContentSettings {
    /** Whether to build {@link import('./ServerContent').ServerContent} at startup. */
    readonly enabled: boolean;
    /** Whether a pack error stops the server. */
    readonly strict: boolean;
    /** Behavior pack directories the world adds to the stack. */
    readonly worldPacks: readonly string[];
    /** Java datapack directories the world adds to the stack. */
    readonly datapacks: readonly string[];
}

/**
 * Reads the content settings, writing any key the file lacks.
 *
 * `JSP_CONTENT` overrides `content-packs` in both directions, so a test or a
 * one-off run turns the build on without editing a file the run would then
 * leave behind.
 */
export const readContentSettings = (): ContentSettings => {
    const config = new ConfigBuilder(withCwd(FILE_NAME));
    const read = <T>(key: keyof typeof COMMENTS, defaults: T): T => config.get(key, defaults, COMMENTS[key]);

    const configured = read('content-packs', false);
    const override = process.env[CONTENT_ENABLED_ENV];

    return {
        enabled: override === undefined ? configured : override !== '' && override !== '0' && override !== 'false',
        strict: read('content-strict', false),
        worldPacks: read<string[]>('content-world-packs', []),
        datapacks: read<string[]>('content-datapacks', [])
    };
};
