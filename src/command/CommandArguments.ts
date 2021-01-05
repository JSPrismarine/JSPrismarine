import { StringReader, Suggestions } from '@jsprismarine/brigadier';
import Gamemode from '../world/Gamemode';
import Vector3 from '../math/Vector3';
import Server from '../Server';

export class CommandArgumentGamemode {
    parse(reader: StringReader) {
        const start = reader.getCursor();
        const gm = reader.readString();

        try {
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
}

export class CommandArgumentEntity {
    parse(reader: StringReader) {
        const start = reader.getCursor();
        const player = reader.readString();

        try {
            return Server.instance.getPlayerByName(player);
        } catch {
            reader.setCursor(start);
        }
    }
}

export class CommandArgumentFloatPosition extends Vector3 {
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
}
