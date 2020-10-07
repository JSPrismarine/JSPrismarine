const { parentPort } = require('worker_threads');
const CoordinateUtils = require('./coordinate-utils');

parentPort.on('message', function ({ viewDistance, currentX, currentZ }) {
    let currentXChunk = CoordinateUtils.fromBlockToChunk(currentX);
    let currentZChunk = CoordinateUtils.fromBlockToChunk(currentZ);
    for (let sendXChunk = -viewDistance; sendXChunk <= viewDistance; sendXChunk++) {
        for (let sendZChunk = -viewDistance; sendZChunk <= viewDistance; sendZChunk++) {
            let distance = Math.sqrt(sendZChunk * sendZChunk + sendXChunk * sendXChunk);
            let chunkDistance = Math.round(distance);

            if (chunkDistance <= viewDistance) {
                let newChunk = [currentXChunk + sendXChunk, currentZChunk + sendZChunk];
                parentPort.postMessage(newChunk);
            }
        }
    }
});
