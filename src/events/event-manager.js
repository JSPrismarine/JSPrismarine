const EventEmitter = require('events').EventEmitter;

'use strict';

let emitterInstance = new EventEmitter();

let ogEmit = emitterInstance.emit;

emitterInstance.emit = function (name, ...args) {
    ogEmit.apply(this, ["*", {name, args}]);
    ogEmit.apply(this, [name, ...args]);
};

module.exports = emitterInstance;