'use strict';

class ServerName {

    /** @type {string} */
    #motd = 'JSRakNet - JS powered RakNet'
    /** @type {string} */
    #name = 'JSRakNet'
    /** @type {number} */
    #protocol = 408
    /** @type {string} */
    #version = '1.16.20'
    /** @type {object} */
    #players = {
        online: 0,
        max: 5
    }
    /** @type {string} */
    #gamemode = 'Creative'
    /** @type {number} */
    #serverId = 0

    getMotd() {
        return this.#motd;
    }

    setMotd(motd) {
        this.#motd = motd;
    }

    getName() {
        return this.#name;
    }

    setName(name) {
        this.#name = name;
    }

    getProtocol() {
        return this.#protocol;
    }

    setProtocol(protocol) {
        this.#protocol = protocol;
    }

    getVersion() {
        return this.#version;
    }

    setVersion(version) {
        this.#version = version;
    }

    getOnlinePlayerCount() {
        return this.#players.online;
    }

    setOnlinePlayerCount(count) {
        this.#players.online = count;
    }

    getMaxPlayerCount() {
        return this.#players.max;
    }

    setMaxPlayerCount(count) {
        this.#players.max = count;
    }

    getGamemode() {
        return this.#gamemode;
    }

    setGamemode(gamemode) {
        this.#gamemode = gamemode;
    }

    getServerId() {
        return this.#serverId;
    }

    setServerId(id) {
        this.#serverId = id;
    }

    toString() {
        return [
            'MCPE',
            this.#motd,
            this.#protocol,
            this.#version,
            this.#players.online,
            this.#players.max,
            this.#serverId,
            this.#name,
            this.#gamemode
        ].join(';') + ';';
    }
}
module.exports = ServerName;