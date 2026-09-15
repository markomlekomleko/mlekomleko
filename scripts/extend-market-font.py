"""Add Serbian Latin glyphs using this font's existing outlines and accent shapes.

Run with Python + fonttools + brotli. The original asset remains unchanged.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

root = Path(__file__).resolve().parents[1]
font = TTFont(root / 'public/fonts/market/grotesk-bold.woff2')
glyphs = font.getGlyphSet()

def bounds(name):
    pen = BoundsPen(glyphs)
    glyphs[name].draw(pen)
    return pen.bounds

def save_glyph(char, name, base, pen):
    glyph = pen.glyph()
    font['glyf'][name] = glyph
    glyph.recalcBounds(font['glyf'])
    font['hmtx'][name] = (font['hmtx'][base][0], glyph.xMin)
    for table in font['cmap'].tables:
        if table.isUnicode():
            table.cmap[ord(char)] = name
    # Inherit the base glyph's kerning classes.
    if 'GPOS' in font:
        for lookup in font['GPOS'].table.LookupList.Lookup:
            for sub in lookup.SubTable:
                for attr in ('ClassDef1', 'ClassDef2'):
                    definition = getattr(sub, attr, None)
                    if definition and base in definition.classDefs:
                        definition.classDefs[name] = definition.classDefs[base]

for char, base, mark, name in [
    ('Š', 'S', 'caron', 'Scaron'), ('š', 's', 'caron', 'scaron'),
    ('Č', 'C', 'caron', 'Ccaron'), ('č', 'c', 'caron', 'ccaron'),
    ('Ć', 'C', 'acute', 'Cacute'), ('ć', 'c', 'acute', 'cacute'),
    ('Ž', 'Z', 'caron', 'Zcaron'), ('ž', 'z', 'caron', 'zcaron'),
]:
    pen = TTGlyphPen(glyphs)
    glyphs[base].draw(pen)
    source = 'circumflex' if mark == 'caron' else 'acute'
    left, bottom, right, top = bounds(source)
    base_left, _, base_right, _ = bounds(base)
    dx = round((base_left + base_right - left - right) / 2)
    # Existing capital accents sit 260 units above their lowercase counterparts.
    shift = 260 if base.isupper() else 4
    transform = (1, 0, 0, -1, dx, bottom + top + shift) if mark == 'caron' else (1, 0, 0, 1, dx, shift)
    glyphs[source].draw(TransformPen(pen, transform))
    save_glyph(char, name, base, pen)

for char, base, name, rect in [
    ('Đ', 'D', 'Dcroat', (-35, 620, 780, 840)),
    ('đ', 'd', 'dcroat', (665, 1345, 1410, 1535)),
]:
    pen = TTGlyphPen(glyphs)
    glyphs[base].draw(pen)
    x0, y0, x1, y1 = rect
    pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
    save_glyph(char, name, base, pen)

font['OS/2'].recalcUnicodeRanges(font)
font.flavor = 'woff2'
out = root / 'public/fonts/market/grotesk-bold-serbian.woff2'
font.save(out)
check = TTFont(out)
assert all(ord(c) in check.getBestCmap() for c in 'ŠšČčĆćŽžĐđ')
print(f'Created {out.name}: all Serbian Latin glyphs present')
