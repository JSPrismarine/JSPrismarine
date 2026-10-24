import yaml from 'js-yaml';
import JSON5 from 'json5';
import fs from 'node:fs';
import path from 'node:path';

/** Anything a path can descend into: a plain object or an array. */
const isTree = (value: unknown): value is object => typeof value === 'object' && value !== null;

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const isUnsafeKey = (key: string): boolean => UNSAFE_KEYS.has(key);

/** Splits `a.b[0].c` into its keys. */
const keysOf = (path: string): string[] => path.match(/[^.[\]]+/g) ?? [];

const walk = (root: unknown, keys: string[]): unknown => {
    let current: unknown = root;
    for (const key of keys) {
        if (!isTree(current)) return undefined;
        current = Reflect.get(current, key);
    }
    return current;
};

/**
 * Minimal path helpers over nested config data. A dotted key is tried literally first,
 * so `get(data, 'server-ip')` and a key that happens to contain a dot both still work.
 */
const _ = {
    get: (obj: unknown, path: string, defaultValue?: unknown): unknown => {
        const literal = path.split(/[,[\]]+/).filter(Boolean);
        const result = walk(obj, literal) ?? walk(obj, keysOf(path));
        return result === undefined || result === obj ? defaultValue : result;
    },
    set: <O extends object>(obj: O, path: string | string[], value: unknown): O => {
        const keys = Array.isArray(path) ? path : keysOf(path);
        if (keys.some(isUnsafeKey)) return obj;
        let current: object = obj;
        for (const [index, key] of keys.slice(0, -1).entries()) {
            const hasOwn = Object.hasOwn(current, key);
            const next = hasOwn ? Reflect.get(current, key) : undefined;

            if (hasOwn && isTree(next)) {
                current = next;
                continue;
            }

            const created: object = /^\d+$/.test(keys[index + 1] ?? '') ? [] : Object.create(null);
            Reflect.set(current, key, created);
            current = created;
        }
        const last = keys.at(-1);
        if (last !== undefined && !isUnsafeKey(last)) Reflect.set(current, last, value);
        return obj;
    },
    has: (obj: unknown, key: string): boolean => {
        const [head, ...rest] = key.split('.');
        if (!isTree(obj) || head === undefined) return false;
        if (rest.length > 0) return _.has(Reflect.get(obj, head), rest.join('.'));
        return Object.hasOwn(obj, key);
    },
    del: (obj: unknown, path: string | string[]): boolean => {
        const keys = Array.isArray(path) ? path : keysOf(path);
        if (keys.some(isUnsafeKey)) return false;
        const parent = walk(obj, keys.slice(0, -1));
        const last = keys.at(-1);
        if (isTree(parent) && last !== undefined) Reflect.deleteProperty(parent, last);
        return true;
    }
};

/** What a freshly created file of each format contains. */
const TypeDefaults = {
    json: '{}',
    yaml: ' '
};

type ConfigType = keyof typeof TypeDefaults;

const isConfigType = (ext: string): ext is ConfigType => Object.hasOwn(TypeDefaults, ext);

export type ConfigData = Record<string, unknown>;

/** Whether parsed file content is a key-value object rather than a scalar, a list or nothing. */
const isConfigData = (value: unknown): value is ConfigData => isTree(value) && !Array.isArray(value);

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
 * General config-file handler.
 */
export class ConfigBuilder {
    private type: ConfigType;
    private path: string;

    /**
     * Config constructor.
     * @throws Error when the file extension is not one of the supported formats.
     */
    public constructor(filePath: string) {
        const pathSplitted = path.parse(filePath);
        const ext = pathSplitted.ext.slice(1).toLowerCase();

        if (!isConfigType(ext)) {
            throw new Error(`Unsupported config type. (Supported types: ${Object.keys(TypeDefaults).join(', ')})`);
        }
        this.type = ext;

        // Create the config directory if it doesn't exist.
        if (!fs.existsSync(pathSplitted.dir)) fs.mkdirSync(pathSplitted.dir, { recursive: true });
        if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, TypeDefaults[this.type], 'utf8');

        this.path = filePath;
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
    public getType(): ConfigType {
        return this.type;
    }

    private setFileData(data: ConfigData = {}) {
        fs.writeFileSync(this.path, this.stringify(data));
    }

    private stringify(data: ConfigData = {}) {
        // FIXME: This overwrites comments in the file.
        switch (this.type) {
            case 'json':
                return JSON.stringify(data, null, 4);
            case 'yaml':
                return yaml.dump(data, { indent: 4 });
            default:
                throw new Error(`Unknown config type ${this.type}!`);
        }
    }

    /**
     * Reads and parses the file. Anything that is not a key-value object, including an empty
     * or unparsable file, reads as `{}` so that defaults written afterwards are kept.
     */
    private getFileData(): ConfigData {
        const raw = fs.readFileSync(this.path, 'utf8');
        let parsed: unknown;

        switch (this.type) {
            case 'json':
                try {
                    parsed = JSON5.parse(raw);
                } catch {}
                break;
            case 'yaml':
                try {
                    parsed = yaml.load(raw);
                } catch {}
                break;
            default:
                throw new Error(`Unknown config type: ${this.type}!`);
        }

        return isConfigData(parsed) ? parsed : {};
    }

    /**
     * Get a config value from a key, writing the default to the file when the key is absent.
     *
     * A stored value of a different kind than the default (a string where a number is
     * expected, say) is ignored in favour of the default, and the file is left alone.
     *
     * @param key - the config key
     * @param defaults - the value to use, and persist, when the key is missing
     */
    public get<T>(key: string, defaults: T): T;
    /**
     * Get a config value from a key, or `undefined` when the key is absent.
     *
     * @param key - the config key
     */
    public get(key: string): unknown;
    /** Shared body of the two `get` overloads above; only they are callable. */
    public get<T>(key: string, defaults?: T): unknown {
        const data = this.getFileData();
        const stored = _.get(data, key);
        if (defaults === undefined) return stored;

        if (stored === undefined) {
            this.setFileData(_.set(data, key, defaults));
            return defaults;
        }

        return sameKindAs(stored, defaults) ? stored : defaults;
    }

    /**
     * Sets a key - value pair in config.
     *
     * @returns true if the value was set successfully
     */
    public set(key: string, value: unknown) {
        const data = this.getFileData();
        const newData = _.set(data, key, value);

        try {
            this.setFileData(newData);
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
        const data = this.getFileData();
        const result = _.has(data, key);
        return result;
    }

    /**
     * Delete a config value.
     *
     * @param key - the config key
     * @returns true if the deletion was successful
     */
    public del(key: string): boolean {
        const data = this.getFileData();

        // It mutates the object, we
        // don't need to define a new
        // variable.
        const isSuccessful = _.del(data, key);

        this.setFileData(data);
        return isSuccessful;
    }
}
