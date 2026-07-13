PPT_NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
TEXT_STYLE_TAGS = ("a:rPr", "a:defRPr", "a:endParaRPr")
FONT_TAGS = ("a:latin", "a:ea", "a:cs")
THEME_FONT_REFERENCES = {"+mn-lt", "+mj-lt", "+mn-ea", "+mj-ea", "+mn-cs", "+mj-cs"}
SFNT_FORMATS = {
    "\x00\x01\x00\x00": "TrueType",
    "true": "TrueType",
    "typ1": "PostScript Type 1",
    "OTTO": "OpenType CFF",
    "ttcf": "TrueType Collection",
    "wOFF": "WOFF",
    "wOF2": "WOFF2",
}
