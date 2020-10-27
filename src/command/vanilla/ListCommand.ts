<<<<<<< HEAD:src/command/vanilla/list-command.js
const Command = require('../').default;
const Player = require('../../player/Player').default;
=======
import Command from "..";
import type Player from "../../player";
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/command/vanilla/ListCommand.ts

export default class ListCommand extends Command {

    constructor() {
        super({ id: 'minecraft:list', description: 'Lists players on the server.' });
    }

    /**
     * @param {Player} sender 
     * @param {Array} args 
     */
    execute(sender: Player, args: Array<string>) {
        let players = sender.getServer().getOnlinePlayers();
        let playerArray = Array.from(players);
        let maxPlayers = sender.getServer().getRaknet().name.getMaxPlayerCount();
        let counter = playerArray.length;
        let answer = playerArray.map(player => player.getUsername()).join(', ');

        sender.sendMessage(`There are ${counter}/${maxPlayers} players online:`);
        if (answer)
            sender.sendMessage(answer);
    }
};
