# Card fonts

The link preview cards draw their text with these files. Satori reads WOFF but not WOFF2, and it
cannot set a variable font's axes, so the cards need static instances of the brand's two typefaces.
The build reads the files from here and never fetches a font.

`typefaces.ts` says which file sets what. Bricolage Grotesque comes at two optical sizes: the 96pt
cut for titles, as the site's headlines use, and the 32pt cut for labels and body text.

They were downloaded on 2026-11-20 from the Google Fonts CSS API (Bricolage Grotesque v9, JetBrains
Mono v24), asking for one weight and optical size per file, such as
`https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@96,800`, with a user agent old
enough that the API answers with WOFF. Both typefaces are under the SIL Open Font License 1.1; the
license texts are in this folder.
