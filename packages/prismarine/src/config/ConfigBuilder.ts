import fs from 'node:fs';
import path from 'node:path';

import { CONFIG_FORMATS, parseConfigDocument } from './ConfigDocument';
import type { ConfigDocument, ConfigFormat, ConfigPath } from './ConfigDocument';
import { toJsonFileContents } from './JsonFile';

/** What a whole config file holds once parsed: a map from key to whatever the file says. */
export type ConfigData = Record<string, unknown>;

/** What a freshly created file of each format contains: valid, and empty. */
const EMPTY_FILE: Readonly<Record<ConfigFormat, string>> = {
    json: '{}\n',
    yaml: ''
};

const isConfigFormat = (ext: string): ext is ConfigFormat => CONFIG_FORMATS.some((format) => format === ext);

/** Keys that would reach into an object's prototype rather than its own data. */
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** Splits `a.b[0].c` into its segments, list indices as numbers. */
const segmentsOf = (key: string): ConfigPath =>
    (key.match(/[^.[\]]+/g) ?? []).map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));

/**
 * Where a key points in a document.
 *
 * The key is tried literally first, so `server-ip` and a key that happens to contain a dot
 * both still work; only when the file has no such top-level key is it read as a path.
 *
 * @returns The path, or `undefined` for a key that names nothing or reaches into a prototype.
 */
const pathOf = (document: ConfigDocument, key: string): ConfigPath | undefined => {
    if (document.has([key])) return [key];
    const segments = segmentsOf(key);
    if (segments.length === 0) return undefined;
    if (segments.some((segment) => typeof segment === 'string' && UNSAFE_KEYS.has(segment))) return undefined;
    return segments;
};

/**
 * Whether a stored value is the same kind of thing as the default it stands in for: the same
 * `typeof`, and an array only if the default is one. This is what lets a value read from the
 * file take the default's type without a cast.
 */
const sameKindAs = <T>(value: unknown, defaults: T): value is T =>
    typeof value === typeof defaults &&
    Array.isArray(value) === Array.isArray(defaults) &&
    (value === null) === (defaults === null);

/**
 * A config file on disk, read and written one key at a time.
 *
 * Every write goes through a {@link ConfigDocument}, so comments and blank lines in the file
 * survive, and a key written for the first time can carry a comment that explains it. The
 * format follows the file extension: `.yaml` or `.json`, where the JSON may hold `//` and
 * `/* *\/` comments and trailing commas.
 */
export class ConfigBuilder {
    private readonly format: ConfigFormat;
    private readonly path: string;

    /**
     * Opens the file, creating it and its directory when they do not exist yet.
     *
     * @throws Error when the file extension is not one of the supported formats.
     */
    public constructor(filePath: string) {
        const parsed = path.parse(filePath);
        const ext = parsed.ext.slice(1).toLowerCase();

        if (!isConfigFormat(ext)) {
            throw new Error(`Unsupported config type. (Supported types: ${CONFIG_FORMATS.join(', ')})`);
        }
        this.format = ext;

        if (!fs.existsSync(parsed.dir)) fs.mkdirSync(parsed.dir, { recursive: true });
        const created = !fs.existsSync(filePath);
        if (created) fs.writeFileSync(filePath, EMPTY_FILE[this.format], 'utf8');

        this.path = filePath;
        if (created && this.format === 'json' && path.basename(filePath) === 'config.json') {
            this.write(this.read());
        }
    }

    /**
     * Get path to the config file on the filesystem.
     *
     * @returns {string} the path to the config file
     */
    public getPath(): string {
        return this.path;
    }

    /**
     * Get the config format (eg. type).
     *
     * @returns {'yaml' | 'json'} either `yaml` or `json`
     */
    public getType(): ConfigFormat {
        return this.format;
    }

    /**
     * Reads the file as a document.
     *
     * A file that does not parse is an error, named after the file, rather than an empty
     * config: writing defaults over a file with a typo in it would erase the rest of it.
     */
    private read(): ConfigDocument {
        const raw = fs.readFileSync(this.path, 'utf8');
        try {
            return parseConfigDocument(this.format, raw);
        } catch (error: unknown) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`Cannot read ${this.path}: ${detail}`, { cause: error });
        }
    }

    private write(document: ConfigDocument): void {
        const text = this.format === 'json' ? toJsonFileContents(this.path, document) : document.toString();
        fs.writeFileSync(this.path, text, 'utf8');
    }

    /**
     * Get a config value from a key, writing the default to the file when the key is absent.
     *
     * A stored value of a different kind than the default (a string where a number is
     * expected, say) is ignored in favor of the default, and the file is left alone.
     *
     * @param key - the config key
     * @param defaults - the value to use, and persist, when the key is missing
     * @param comment - written above the key in the file when the default is persisted
     */
    public get<T>(key: string, defaults: T, comment?: string): T;
    /**
     * Get a config value from a key, or `undefined` when the key is absent.
     *
     * @param key - the config key
     */
    public get(key: string): unknown;
    /** Shared body of the two `get` overloads above; only they are callable. */
    public get<T>(key: string, defaults?: T, comment?: string): unknown {
        const document = this.read();
        const target = pathOf(document, key);
        const stored = target === undefined ? undefined : document.get(target);
        if (defaults === undefined) return stored;

        if (stored === undefined) {
            if (target !== undefined) {
                document.set(target, defaults, comment);
                this.write(document);
            }
            return defaults;
        }

        return sameKindAs(stored, defaults) ? stored : defaults;
    }

    /**
     * Sets a key - value pair in config.
     *
     * @param key - the config key
     * @param value - the value to store
     * @param comment - written above the key when the key is new; an existing key keeps its own
     * @returns true if the value was set successfully
     */
    public set(key: string, value: unknown, comment?: string): boolean {
        const document = this.read();
        const target = pathOf(document, key);
        if (target === undefined) return false;

        try {
            document.set(target, value, comment);
            this.write(document);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if config value exists.
     *
     * @param key - the config key
     * @returns true if the config contains that key
     */
    public has(key: string): boolean {
        const document = this.read();
        const target = pathOf(document, key);
        return target !== undefined && document.has(target);
    }

    /**
     * Delete a config value, and the comment above it.
     *
     * @param key - the config key
     * @returns true if the key was there to delete
     */
    public del(key: string): boolean {
        const document = this.read();
        const target = pathOf(document, key);
        if (target === undefined || !document.delete(target)) return false;

        this.write(document);
        return true;
    }
}
