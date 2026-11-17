/**
 * Java Edition's English strings, which name an advancement in chat.
 *
 * A Java advancement's title is a chat component naming a translation key such as
 * `advancements.story.mine_stone.title`. A Bedrock client has no such key in its language files,
 * so sending the key, with or without a `%`, shows the key itself. The server resolves it from the
 * `en_us.json` that `pnpm --filter @jsprismarine/bedrock-data run extract:lang` lifts out of the
 * pinned Java server jar into the shared cache, the way the vanilla datapack reaches the server.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRecord } from '../utils/isRecord';
import { cacheRoot } from '../world/generators/datadriven/javaWorldgenSources';

/** Points the server at a local copy of Java's `en_us.json`. */
export const JAVA_ENGLISH_ENV = 'JSP_JAVA_LANG';

/** Translation key to English text. */
export type JavaEnglish = ReadonlyMap<string, string>;

/** The newest version's `en_us.json` under the cache's `java-lang`, or undefined when there is none. */
const cachedFile = (): string | undefined => {
    const root = join(cacheRoot(), 'java-lang');
    if (!existsSync(root)) return undefined;
    for (const version of readdirSync(root).sort().reverse()) {
        const file = join(root, version, 'en_us.json');
        if (existsSync(file)) return file;
    }
    return undefined;
};

/**
 * Reads Java's English strings.
 *
 * @param file - The `en_us.json` to read; by default {@link JAVA_ENGLISH_ENV} or the cache's.
 * @returns The strings, empty when there is no file, which leaves every key as it is.
 */
export const loadJavaEnglish = (file = process.env[JAVA_ENGLISH_ENV] || cachedFile()): JavaEnglish => {
    if (file === undefined || !existsSync(file)) return new Map();
    // Extracted game data: parsed, never executed, and only its string values are kept.
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!isRecord(parsed)) return new Map();
    return new Map(
        Object.entries(parsed).flatMap(([key, text]) => (typeof text === 'string' ? [[key, text] as const] : []))
    );
};
