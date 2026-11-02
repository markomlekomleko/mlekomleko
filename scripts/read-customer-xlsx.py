"""One worksheet, text/numeric values only. Reject formulas instead of trusting cached values."""
import json, sys, zipfile, xml.etree.ElementTree as ET
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
    sheets=[n for n in z.namelist() if n.startswith('xl/worksheets/sheet') and n.endswith('.xml')]
    if len(sheets)!=1: raise ValueError('Ostavite tačno jedan list u XLSX fajlu za uvoz.')
    if sum(i.file_size for i in z.infolist())>50*1024*1024: raise ValueError('XLSX je prevelik.')
    strings=[]
    if 'xl/sharedStrings.xml' in z.namelist():
        strings=[''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
    rows=[]
    for r in ET.fromstring(z.read(sheets[0])).findall('s:sheetData/s:row',ns):
        cells={}
        for c in r.findall('s:c',ns):
            if c.find('s:f',ns) is not None: raise ValueError('Formule nisu dozvoljene. Nalepite potvrđene vrednosti.')
            col=''.join(x for x in c.attrib['r'] if x.isalpha()); index=0
            for letter in col: index=index*26+ord(letter)-64
            v=c.find('s:v',ns); value=v.text or '' if v is not None else ''
            if c.attrib.get('t')=='s': value=strings[int(value)]
            elif c.attrib.get('t')=='inlineStr': value=''.join(c.find('s:is',ns).itertext())
            elif c.attrib.get('t')=='b': value='true' if value=='1' else 'false'
            elif c.attrib.get('t')=='e': raise ValueError('Excel sadrži grešku ćelije.')
            cells[index-1]=value
        if any(cells.values()): rows.append(cells)
        if len(rows)>10001: raise ValueError('Najviše 10000 redova.')
    headers=rows.pop(0) if rows else {}
    if not headers or len(set(headers.values()))!=len(headers): raise ValueError('Zaglavlja moraju biti jedinstvena.')
    if any(set(r)-set(headers) for r in rows): raise ValueError('Podaci nemaju odgovarajuće zaglavlje.')
    print(json.dumps([{key:r.get(i,'') for i,key in headers.items()} for r in rows],ensure_ascii=False))
