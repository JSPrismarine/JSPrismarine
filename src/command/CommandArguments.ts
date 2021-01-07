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
    parse(reader: StringReader) {
        const start = reader.getCursor();
        const gm = reader.readString();

        try {
            // TODO: correctly throw
            Gamemode.getGamemodeId(gm);
            return gm;
        } catch {
            reader.setCursor(start);
        }
    }
    async listSuggestions(context: any, builder: any) {
        // TODO
        return Suggestions.empty();
    }
    getExamples() {
        return ['survival', 'creative', 'adventure', 'spectator'];
    }

    public getReadableType(): string {
        return '<gamemode>';
    }
}

export class CommandArgumentEntity implements CommandArgument {
    parse(reader: StringReader) {
        const start = reader.getCursor();
        const player = reader.readUnquotedString();

        try {
            // TODO: correctly throw
            return Server.instance.getPlayerManager().getPlayerByName(player);
        } catch {
            reader.setCursor(start);
        }
    }

    public getReadableType(): string {
        return '<target>';
    }
}

export class CommandArgumentFloatPosition
    extends Vector3
    implements CommandArgument {
    constructor() {
        super();
    }

    parse(reader: StringReader) {
        this.setX(reader.readFloat());
        reader.skip();
        this.setY(reader.readFloat());
        reader.skip();
        this.setZ(reader.readFloat());
        return this;
    }

    getExamples() {
        return ['1 2 3'];
    }

    public getReadableType(): string {
        return '[x] [y] [z]';
    }
}
