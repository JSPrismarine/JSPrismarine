export class CommandArgumentGamemode {
    parse(reader: any) {
        return reader.readString();
    }
    listSuggestions(context, builder) {
        // TODO
        return Suggestions.empty();
    }
    getExamples() {
        return ['survival'];
    }
}
