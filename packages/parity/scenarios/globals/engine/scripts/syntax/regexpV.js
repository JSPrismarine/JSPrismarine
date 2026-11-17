// A regular expression literal with the `v` flag, which an engine without it refuses to parse.
export default /[\p{L}--[a-z]]/v.test('1');
