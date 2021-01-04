/**
 * @author <TheArmagan> kiracarmaganonal@gmail.com
 * @author <HerryYT> enricoangelon.ea@gmail.com
 * @author <Filiph Sandström> filiph.sandstrom@filfatstudios.com
 */

import YAML from 'yaml';
import fs from 'fs';
import path from 'path';

const _ = {
    get: require('lodash/get'),
    set: require('lodash/set'),
    has: require('lodash/has'),
    del: require('lodash/unset')
};

const TypeDefaults = {
    json: '{}',
    yaml: ' '
};

export default class ConfigBuilder {
    private type: string;
    private path: string;

    /**
     * Config constructor.
     */
    constructor(filePath: string) {
        const pathSplitted = path.parse(filePath);

        this.type = pathSplitted.ext.slice(1);

        if (
            !Object.keys(TypeDefaults).some(
                (i) => i.toLowerCase() === this.type.toLowerCase()
            )
        ) {
            throw new Error(
                `Unsupported config type. (Supported types: ${Object.keys(
                    TypeDefaults
                ).join(', ')})`
            );
        }

        if (fs.existsSync(pathSplitted.dir)) {
            fs.mkdirSync(pathSplitted.dir, { recursive: true });
        }

        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(
                filePath,
                (TypeDefaults as any)[this.type],
                'utf8'
            );
        }

        this.path = filePath;
    }

    public getPath(): string {
        return this.path;
    }

    public getType(): string {
        return this.type;
    }

    private setFileData(data = {}) {
        let fileData = '';
        switch (this.type) {
            case 'json':
                fileData = JSON.stringify(data, null, 2);
                break;
            case 'yaml':
                fileData = YAML.stringify(data, { indent: 2 });
                break;
            default:
                throw new Error(`Unknown config type ${this.type}!`);
        }

        fs.writeFileSync(this.path, fileData, 'utf8');
    }

    private getFileData(): any {
        let resultData = {};
        const rawFileData = fs.readFileSync(this.path, 'utf8');
        switch (this.type) {
            case 'json':
                resultData = JSON.parse(rawFileData);
                break;
            case 'yaml':
                resultData = YAML.parse(rawFileData, { indent: 2 });
                break;
            default:
                throw new Error(`Unknown config type: ${this.type}!`);
        }

        return resultData || {};
    }

    /**
     * Returns the value of the key.
     */
    public get(key: string, defaults: any): any {
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
     */
    public set(key: string, value: any) {
        const data = this.getFileData();
        const newData = _.set(data, key, value);
        this.setFileData(newData);
    }

    /**
     * Returns true if the config
     * contains that key.
     */
    public has(key: string): boolean {
        const data = this.getFileData();
        const result = _.has(data, key);
        return result;
    }

    /**
     * Returns true if the
     * deletion was successful.
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
