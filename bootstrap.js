'use strict'

const server = require('./src/server')

// Kills the server when exiting process
let exitEvents = ['SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'];
for (let event of exitEvents) {
    process.on(event, () => {
        server.kill();
    });
}
