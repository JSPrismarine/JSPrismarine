/**
 * The `config.json` settings that say what goes in the server's pack stack.
 *
 * The build itself is not optional. Blocks, items, entities and the rest come
 * from the stack on every server, so these keys only add to it and decide what
 * a broken pack does.
 *
 * Read through a `ConfigBuilder` of its own rather than through `Config`,
 * because `Config` reads every key it knows at `enable` time and the content
 * build happens before that. Both builders open the same `config.json` through
 * `openConfigFile`, so the file stays ordered whichever one writes first.
 * These keys used to live in a separate `config.yaml`.
 */
import { openConfigFile } from '../config/Config';
import type { ContentConfigKey } from '../config/JsonConfigTypes';
import { DEFAULT_PROTOCOL_SETTINGS } from '../network/codec/ProtocolPolicy';
import type { ProtocolSettings } from '../network/codec/ProtocolPolicy';

/** What each key means, written above it the first time the server adds it to the file. */
const COMMENTS = {
    'protocol-window':
        'How many Bedrock releases to accept, counted back from the newest this server supports. 1 accepts the newest only. Upgrading the server moves the window with it.',
    'protocol-content':
        "Which release in protocol-window the world's blocks, items and mobs come from: newest, or oldest so every accepted client has all of them. With newest and a wider window, older clients see a placeholder for what their release lacks.",
    'content-strict': 'Whether a pack that reports an error stops the server instead of loading short.',
    'content-world-packs': 'Extra behavior pack directories this world loads, after the vanilla ones.',
    'content-datapacks': 'Java datapack directories this world loads, after the vanilla one.',
    'content-java-version':
        'The pinned Java release whose datapack, world generation and data version the server runs. Empty runs the default release.'
} as const satisfies Record<ContentConfigKey, string>;

/** What the content settings say. */
export interface ContentSettings {
    /** Whether a pack error stops the server. */
    readonly strict: boolean;
    /** Behavior pack directories the world adds to the stack. */
    readonly worldPacks: readonly string[];
    /** Java datapack directories the world adds to the stack. */
    readonly datapacks: readonly string[];
    /** Which protocols to accept and which release's content the world holds. */
    readonly protocols: ProtocolSettings;
    /** The pinned Java release the config names, or undefined for the default release. */
    readonly javaVersion?: string;
}

/** Reads the content settings, writing any key the file lacks. */
export const readContentSettings = (): ContentSettings => {
    const config = openConfigFile();
    const read = <T>(key: keyof typeof COMMENTS, defaults: T): T => config.get(key, defaults, COMMENTS[key]);

    // A number such as `26.3` written without quotes still names a release, so the value is read
    // as text; one that names no pinned release fails when the pack stack resolves it.
    const javaVersion = String(read<unknown>('content-java-version', '')).trim();
    return {
        strict: read('content-strict', false),
        worldPacks: read<string[]>('content-world-packs', []),
        datapacks: read<string[]>('content-datapacks', []),
        protocols: {
            window: read('protocol-window', DEFAULT_PROTOCOL_SETTINGS.window),
            // Anything but `oldest` is the default, so a misspelling never hides content.
            content:
                read<string>('protocol-content', DEFAULT_PROTOCOL_SETTINGS.content) === 'oldest' ? 'oldest' : 'newest'
        },
        ...(javaVersion === '' ? {} : { javaVersion })
    };
};
