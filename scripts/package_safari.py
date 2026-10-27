"""Package the Safari development app and rebuildable Xcode project."""
from pathlib import Path
import json,zipfile,subprocess,argparse
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--app',type=Path,required=True);args=parser.parse_args()
app=args.app.resolve();assert app.is_dir()
subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
version=json.loads((root/'extension/manifest.json').read_text())['version']
resources=app/'Contents/PlugIns/ChatGPT Export Extension.appex/Contents/Resources'
for name in ['content.js','preview.js','preview.html','preview.css','export-formats.js','vendor/docx.js','vendor/katex/katex.min.css','icons/icon-128.png']:
    assert (resources/name).read_bytes()==(root/'extension'/name).read_bytes(),name
out=root/f'dist/chat-conversation-exporter-safari-dev-v{version}.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for path in sorted(app.rglob('*')):
        if path.is_file():z.write(path,'Safari-Development/'+app.name+'/'+path.relative_to(app).as_posix())
    for path in sorted((root/'safari').rglob('*')):
        if path.is_file() and not any(x in path.parts for x in ['xcuserdata','DerivedData']) and path.name!='.DS_Store':z.write(path,'Safari-Development/source/'+path.relative_to(root/'safari').as_posix())
    for name in ['README.md','LICENSE','PRIVACY.md']:z.write(root/name,'Safari-Development/'+name)
with zipfile.ZipFile(out) as z:assert z.testzip() is None
print(out);print('PASS: signature, bundled source bytes, rebuildable source, ZIP CRC')
