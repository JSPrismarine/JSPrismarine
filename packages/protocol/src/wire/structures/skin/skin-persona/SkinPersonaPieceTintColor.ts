/** The color palette applied to one persona piece type. */
export default class SkinPersonaPieceTintColor {
    private readonly colors: string[] = [];
    private pieceType!: string;

    /** Returns the palette's color values in protocol order. */
    public getColors(): string[] {
        return this.colors;
    }

    /** Returns the persona slot this palette colors. */
    public getPieceType(): string {
        return this.pieceType;
    }

    /** Sets the persona slot this palette colors. */
    public setPieceType(pieceType: string): void {
        this.pieceType = pieceType;
    }
}
