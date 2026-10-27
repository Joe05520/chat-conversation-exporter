"""Validate artifacts downloaded from tests/export-formats.html (synthetic data only)."""
from pathlib import Path
import argparse,zipfile,json,xml.etree.ElementTree as E
from html.parser import HTMLParser
p=argparse.ArgumentParser();p.add_argument('directory',type=Path);args=p.parse_args()
root=args.directory
asm='loop:\n    lw   t0, 0(a0)    # load word\n    add  t1, t0, a1\n\n    sw   t1, 0(a0)\n    bnez t1, loop'
assert asm in (root/'ASM-export.txt').read_text(encoding='utf-8-sig')
class HtmlCheck(HTMLParser):
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        assert tag not in ['script','iframe','object','embed'],tag
        if tag=='img':assert attrs.get('src','').startswith('data:image/'),attrs
html=(root/'ASM-export.html').read_text();HtmlCheck().feed(html)
assert asm in html and 'default-src' in html
with zipfile.ZipFile(root/'ASM-export.docx') as z:
    assert z.testzip() is None
    xml=E.fromstring(z.read('word/document.xml'))
    ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','m':'http://schemas.openxmlformats.org/officeDocument/2006/math'}
    paragraphs=[''.join(p.itertext()) for p in xml.findall('.//w:p',ns)]
    for line in asm.splitlines():assert line in paragraphs,line
    assert len(xml.findall('.//m:f',ns))>=1
    assert len(xml.findall('.//m:rad',ns))>=1
    assert len(xml.findall('.//w:tbl',ns))>=1
    assert any(x.endswith('.svg') for x in z.namelist())
    assert any(x.endswith('.png') for x in z.namelist())
print('PASS: exact ASM lines, no active HTML, DOCX equations/tables/SVG/PNG and ZIP CRC')

if (root/'ASM-export.json').exists():
    data=json.loads((root/'ASM-export.json').read_text())
    assert asm in data['messages'][0]['text']
    print('PASS: JSON preserves the blank ASM line and indentation')
