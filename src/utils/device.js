'use strict';

class Device {

    /** @type {number} */
    inputMode
    /** @type {string} */
    id
    /** @type {number} */
    os
    /** @type {string} */
    model
    /** @type {number} */
    guiScale

    /**
     * Device constructor.
     * 
     * @param {object} params 
     * @param {string} params.id - device ID
     * @param {string} params.model - device model
     * @param {number} params.os - device OS
     * @param {number} params.inputMode - input mode (touch, m&k...)
     * @param {number} params.guiScale - gui scale 
     */
    constructor({id, model, os, inputMode, guiScale}) {
        this.id = id;
        this.model = model;
        this.os = os;
        this.inputMode = inputMode;
        this.guiScale = guiScale;
    }

}
module.exports = Device;