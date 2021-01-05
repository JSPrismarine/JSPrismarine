import {
    CommandSyntaxException,
    StringReader,
    Suggestions
} from '@jsprismarine/brigadier';
import Vector3 from '../math/Vector3';
import Gamemode from '../world/Gamemode';

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
    listSuggestions(context: any, builder: any) {
        // TODO
        return Suggestions.empty();
    }
    getExamples() {
        return 'survival';
    }
}

export class FloatPosition extends Vector3 {
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
