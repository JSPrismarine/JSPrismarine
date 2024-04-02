import ImmutableStringReader from "../ImmutableStringReader"

export default class StringRange {
	
    private start: number;    
    private end: number;
    
    public constructor (start: number, end: number) {
        this.start = start;
        this.end = end;
    }
    
	public static at(pos: number): StringRange {
        return new StringRange(pos, pos);
    }

    public static between(start: number, end: number): StringRange {
        return new StringRange(start, end);
    }

    public static encompassing(a: StringRange, b: StringRange): StringRange {
        return new StringRange(Math.min(a.getStart(), b.getStart()), Math.max(a.getEnd(), b.getEnd()));
    }
    
    public getStart(): number {
        return this.start;
    }
    
    public getEnd(): number {
        return this.end;
    }
    
    public get(str: ImmutableStringReader | string): string {
		if (typeof str === "string")
			return str.substring(this.start, this.end);
		else
        	return str.getString().substring(this.start, this.end);
    }    
    
    public isEmpty(): boolean {
        return this.start === this.end;
    }
    
    public getLength(): number {
        return this.end - this.start;
    }
    
    public equals(o: object): boolean {
        if (this === o) return true;        
        if (!(o instanceof  StringRange)) return false;
        return this.start === o.start && this.end == o.end;
    }
    
    public toString(): string {
        return "StringRange{" + "start=" + this.start + ", end=" + this.end + '}';
    }
}