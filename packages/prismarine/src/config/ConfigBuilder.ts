import { ConfigInvalidDataError } from '@jsprismarine/errors';
import { parseJSON5, parseYAML, stringifyYAML } from 'confbox';
import fs from 'node:fs';
import path from 'node:path';

const _ = {
    get: (obj: any, path: string, defaultValue = undefined) => {
        const travel = (regexp: any) =>
            String.prototype.split
                .call(path, regexp)
                .filter(Boolean)
                .reduce((res, key) => (res !== null && res !== undefined ? res[key] : res), obj);
        const result = travel(/[,[\]]+?/) || travel(/[,[\].]+?/);
        return result === undefined || result === obj ? defaultValue : result;
    },
    set: (obj: any, path: any, value: any) => {
        if (Object(obj) !== obj) return obj;
        if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || [];
        path
            .slice(0, -1)
            .reduce(
                (a: any, c: any, i: any) =>
                    Object(a[c]) === a[c]
                        ? a[c]
                        : (a[c] = Math.abs(path[i + 1]) >> 0 === Number(path[i + 1]) ? [] : {}),
                obj
            )[path.at(-1)] = value;
        return obj;
    },
    has: (obj: any, key: string): boolean => {
        const keyParts = key.split('.');

        return Boolean(
            obj &&
            (keyParts.length > 1
                ? _.has(obj[key.split('.')[0]!], keyParts.slice(1).join('.'))
                : Object.hasOwnProperty.call(obj, key))
        );
    },
    del: (obj: any, path: any) => {
        const pathArray = Array.isArray(path) ? path : path.match(/([^[.\]])+/g);

        pathArray.reduce((acc: any, key: any, i: number) => {
            if (i === pathArray.length - 1) delete acc[key];
            return acc[key];
        }, obj);
        return true;
    }
};

const TypeDefaults = {
    json: '{}',
    yaml: ' '
};

export type ConfigData = {
    [key: string]: any;
};

/**
 * General config-file handler.
 */
export class ConfigBuilder {
    private type: 'yaml' | 'json';
    private path: string;

    /**
     * Config constructor.
     */
    public constructor(filePath: string) {
        const pathSplitted = path.parse(filePath);

        this.type = pathSplitted.ext.slice(1) as 'yaml' | 'json';

        if (!Object.keys(TypeDefaults).some((i) => i.toLowerCase() === this.type.toLowerCase())) {
            throw new Error(`Unsupported config type. (Supported types: ${Object.keys(TypeDefaults).join(', ')})`);
        }

        // Create the config directory if it doesn't exist.
        if (!fs.existsSync(pathSplitted.dir)) fs.mkdirSync(pathSplitted.dir, { recursive: true });
        if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, (TypeDefaults as any)[this.type], 'utf8');

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
    public getType(): 'yaml' | 'json' {
        return this.type;
    }

    /**
     * @private
     */
    private setFileData(data: ConfigData = {}) {
        if (!(data as any)) throw new ConfigInvalidDataError();
        fs.writeFileSync(this.path, this.stringify(data), 'utf8');
    }

    /**
     * @private
     */
    private stringify(data: ConfigData = {}) {
        // FIXME: This overwrites comments in the file.
        switch (this.type) {
            case 'json':
                return JSON.stringify(data, null, 4);
            case 'yaml':
                return stringifyYAML(data, { indent: 4 });
            default:
                throw new Error(`Unknown config type ${this.type}!`);
        }
    }

    private getFileData(): ConfigData {
        const raw = fs.readFileSync(this.path, 'utf8');

        switch (this.type) {
            case 'json':
                try {
                    return parseJSON5(raw);
                } catch {}
                break;
            case 'yaml':
                try {
                    return parseYAML(raw);
                } catch {}
                break;
            default:
                throw new Error(`Unknown config type: ${this.type}!`);
        }

        return {};
    }

    /**
     * Get a config value from a key.
     *
     * @param {string} key - the config key
     * @param {T} defaults -
     */
    public get<T = any>(key: string, defaults?: T): T {
        const data = this.getFileData();
        let result = _.get(data, key);

        if (typeof result === 'undefined' && typeof defaults !== 'undefined') {
            const newData = _.set(data, key, defaults);
            this.setFileData(newData);
            result = defaults;
        }

        return result;
    }

    /**
     * Sets a key - value pair in config.
     *
     * @returns true if the value was set successfully
     */
    public set(key: string, value: any) {
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
