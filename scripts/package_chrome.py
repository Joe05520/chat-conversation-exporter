"""Build a directly loadable Chrome release ZIP and check every archived source byte."""
import json
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
ext=root/'extension'
manifest=json.loads((ext/'manifest.json').read_text())
output=root/'dist'/f'chat-conversation-exporter-chrome-v{manifest["version"]}.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(ext.rglob('*')):
        if path.is_file():archive.write(path,path.relative_to(ext))
    for name in ['README.md','LICENSE','PRIVACY.md']:archive.write(root/name,name)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert json.loads(archive.read('manifest.json'))['version']==manifest['version']
    required=[manifest['background']['service_worker'],*manifest['icons'].values(),'preview.html','preview.js','preview.css','vendor/katex/katex.min.js','vendor/katex/katex.min.css']
    for script in manifest['content_scripts']:required.extend(script['js'])
    for name in required:assert name in archive.namelist(),name
    for path in ext.rglob('*'):
        if path.is_file():assert archive.read(str(path.relative_to(ext)))==path.read_bytes()
print(output)
print('PASS: root manifest, resource paths, ZIP CRC, source bytes')
