const YAML = require("yaml")
const fs = require("fs")
const path = require("path")

const _ = {
    get: require("lodash/get"),
    set: require("lodash/set"),
    has: require("lodash/has"),
    unset: require("lodash/unset")
}

class ConfigBase {

    /** @type {String} */
    #filePath

    constructor(filePath) {
        filePath = path.resolve(filePath);
        let parsedPath = path.parse(filePath)

        if (!fs.existsSync(parsedPath.dir)) {
            fs.mkdirSync(parsedPath.dir,{recursive:true})
        }

        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath,"","utf8")
        }

        this.#filePath = filePath;
    }

    getFilePath() {
        return this.#filePath
    }

    /**
     * @returns {Object}
     */
    _getConfigData() {
        return (YAML.parse(fs.readFileSync(this.#filePath,"utf8")) || {})
    }

    /**
     * @param {Object} data 
     */
    _setConfigData(data) {
        return fs.writeFileSync(this.#filePath, YAML.stringify(data), "utf8")
    }

    /**
     * @param {String} path 
     * @param {*} value
     * 
     * @returns {Object}
     */
    set(path,value) {
        let data = this._getConfigData()
        data = _.set(data, path, value)
        this._setConfigData(data)
        return data
    }

    /**
     * @param {String} path 
     * @param {*} defaultValue If path does not exits creates the path and sets this value
     * 
     * @returns {*}
     */
    get(path,defaultValue) {
        let data = this._getConfigData()
        let value = _.get(data,path)
        if (typeof value == "undefined") {
            this._setConfigData(_.set(data, path, defaultValue))
            return defaultValue;
        }
        return value
    }

    has(path) {
        let data = this._getConfigData()
        return _.has(data, path)
    }

    del(path) {
        let data = this._getConfigData()
        let isDeleted = _.unset(data, path)
        if (isDeleted) {
            this._setConfigData(data)
        }
        return isDeleted
    }
}

module.exports = ConfigBase