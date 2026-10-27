"""Synchronize offline export adapters and Safari resources before packaging."""
from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
shared=root/'shared/export-formats.js'
for destination in [root/'extension/export-formats.js',root/'codex-local/web/export-formats.js']:
    shutil.copyfile(shared,destination)
safari=root/'safari/ChatGPT Export/ChatGPT Export Extension/Resources'
for path in (root/'extension').rglob('*'):
    if path.is_file():
        target=safari/path.relative_to(root/'extension')
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(path,target)
print('PASS: Codex, Chrome and Safari export resources synchronized')
