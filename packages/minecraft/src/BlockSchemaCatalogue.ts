/** One block state property: how it is written, what it accepts, and its default. */
export interface BlockSchemaProperty {
    type: string;
    values: Array<string | number | boolean>;
    default: string | number | boolean;
}

/** The properties one vanilla block carries. */
export interface BlockSchema {
    properties: Record<string, BlockSchemaProperty>;
}

/** The vanilla block state catalogue, as the data generator writes it. */
export interface BlockSchemaCatalogue {
    $comment: string;
    source: string;
    minecraftVersion: string;
    blockCount: number;
    stateCount: number;
    blocks: Record<string, BlockSchema>;
}
