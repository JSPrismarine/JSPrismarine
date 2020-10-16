const fs = require('fs');
const path = require('path');

// Require providers
const YAML = require('yaml');
const TOML = require('@iarna/toml');

const _ = {
    get: require('lodash/get'),
    set: require('lodash/set'),
    has: require('lodash/has'),
    del: require('lodash/unset')
};


const TypeDefaults = {
    'json': '{}',
    'yaml': ' ',
    'toml': ' '
};

/**
 * @author <TheArmagan> kiracarmaganonal@gmail.com
 * @author <HerryYT> enricoangelon.ea@gmail.com
 */
export default class ConfigBuilder {
    #type:string
    #path: string

    /**
     * Config constructor.
     */
    constructor(filePath: string) {
        let pathSplitted = path.parse(filePath);

        this.#type = pathSplitted.ext.slice(1); 

        if (
            !Object.keys(TypeDefaults).some(
                i => i.toLowerCase() === this.#type.toLowerCase()
            )
        ) {
            throw `Unsupported config type. (Supported types: ${Object.keys(TypeDefaults).join(', ')})`;            
        }

        if (fs.existsSync(pathSplitted.dir)) {
            fs.mkdirSync(pathSplitted.dir, { recursive: true });
        }

        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(
                filePath, (TypeDefaults as any)[this.#type], 'utf8'
            );
        }

        this.#path = filePath;
    }

    /** @returns {string} */
    getPath() {
        return this.#path;
    }
    
    /** @returns {string} */
    getType() {
        return this.#type;
    }

    /**
     * @private
     */
    setFileData(data = {}) {
        let fileData = '';
        switch (this.#type) {
            case 'json':
                fileData = JSON.stringify(data, null, 2);
                break;
            case 'yaml':
                fileData = YAML.stringify(data, {indent: 2});
                break;
            case 'toml':
                fileData = TOML.stringify(data);    
                break;
            default:
                throw `Unknown config type ${this.#type}!`;
        }
        fs.writeFileSync(this.#path, fileData, 'utf8');
    }

    /**
     * @private
     * 
     * @returns {Object}
     */
    getFileData() {
        let resultData = {};
        let rawFileData = fs.readFileSync(this.#path, 'utf8'); 
        switch (this.#type) {
            case 'json':
                resultData = JSON.parse(rawFileData);
                break;
            case 'yaml':
                resultData = YAML.parse(rawFileData, {indent: 2});
                break;
            case 'toml':
                resultData = TOML.parse(rawFileData);
                break;
            default:
                throw `Unknown config type: ${this.#type}!`;
        }

        return (resultData || {});
    }

    /**
     * Returns the value of the key.
     */
    get(key: string, defaults: any) {
        let data = this.getFileData();
        let result = _.get(data, key);
        if (typeof result == 'undefined' && typeof defaults != 'undefined') {
            let newData = _.set(data, key, defaults);
            this.setFileData(newData);
            result = defaults;
        }
        return result;
    }

    /**
     * Sets a key - value pair in config.
     */
    set(key: string, value: any) {
        let data = this.getFileData();
        let newData = _.set(data, key, value);
        this.setFileData(newData);
    }
    
    /**
     * Returns true if the config
     * contains that key.
     */
    has(key: string) {
        let data = this.getFileData();
        let result = _.has(data, key);
        return result;
    }

    /**
     * Returns true if the
     * deletion was successful.
     */
    del(key: string) {
        let data = this.getFileData();
        
        // it mutates the object, we 
        // don't need to define a new
        // variable.
        let isSuccessful = _.del(data, key);

        this.setFileData(data);
        return isSuccessful;
    }

}
