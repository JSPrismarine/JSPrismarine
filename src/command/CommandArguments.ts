import { StringReader, Suggestions } from '@jsprismarine/brigadier';

import Gamemode from '../world/Gamemode';
import Server from '../Server';
import Vector3 from '../math/Vector3';

export abstract class CommandArgument {
    public getReadableType(): string {
        return '';
    }
}

export class CommandArgumentGamemode implements CommandArgument {
    public parse(reader: StringReader) {
        const gm = reader.readString();

        Gamemode.getGamemodeId(gm);
        return gm;
    }
    public async listSuggestions(context: any, builder: any) {
        // TODO
        return Suggestions.empty();
    }
    public getExamples() {
        return ['survival', 'creative', 'adventure', 'spectator'];
    }

    public getReadableType(): string {
        return '<gamemode>';
    }
}

export class CommandArgumentEntity implements CommandArgument {
    public parse(reader: StringReader) {
        let player = '';
        while (true) {
            const pos = reader.getCursor();
            const char = reader.read();
            if (char === ' ') {
                reader.setCursor(pos);
                break;
            }

            player += char;
        }

        // FIXME: utility function
        if (player.startsWith('@')) {
            if (player === '@a')
                return Server.instance.getPlayerManager().getOnlinePlayers();

            throw new Error('TODO');
        }

        return [Server.instance.getPlayerManager().getPlayerByName(player)];
    }

    public getReadableType(): string {
        return '<target>';
    }
}

export class CommandArgumentFloatPosition
    extends Vector3
    implements CommandArgument {
    public constructor() {
        super();
    }

    public parse(reader: StringReader) {
        this.setX(reader.readFloat());
        reader.skip();
        this.setY(reader.readFloat());
        reader.skip();
        this.setZ(reader.readFloat());
        return this;
    }

    public getExamples() {
        return ['1 2 3'];
    }

    public getReadableType(): string {
        return '[x] [y] [z]';
    }
}
