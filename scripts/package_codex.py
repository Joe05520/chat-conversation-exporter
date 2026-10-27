"""Package the offline Codex macOS exporter without any local conversation data."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
source = root / 'codex-local'
output = root / 'dist/codex-conversation-exporter-macos-v0.1.1.zip'
output.parent.mkdir(exist_ok=True)
folder = 'Codex-Conversation-Exporter'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc':
            archive.write(path, folder + '/' + path.relative_to(source).as_posix())
    for name in ('LICENSE', 'PRIVACY.md'):
        archive.write(root / name, folder + '/' + name)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    for name in ('server.py', 'web/app.js', 'web/i18n.js', 'web/vendor/mermaid.min.js', 'web/vendor/katex/katex.min.css', '啟動 Codex 對話列印.command'):
        assert folder + '/' + name in archive.namelist(), name
    assert not any(name.endswith(('.jsonl', '.sqlite', '.pyc')) or '__pycache__' in name for name in archive.namelist())
    launcher = archive.getinfo(folder + '/啟動 Codex 對話列印.command')
    assert (launcher.external_attr >> 16) & 0o111
print(output)
print('PASS: launcher, offline resources, ZIP CRC, no conversation records')
