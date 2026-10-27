#!/usr/bin/env python3
"""Read-only, localhost Codex session exporter. Python 3 standard library only."""
import argparse
import base64
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import sqlite3
import stat
import threading
import queue
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
import webbrowser

HOME = Path(os.environ.get('CODEX_HOME', str(Path.home() / '.codex'))).resolve()
ROOTS = [HOME / 'sessions', HOME / 'archived_sessions']
WEB = Path(__file__).resolve().parent / 'web'
TOKEN = secrets.token_urlsafe(32)
SESSIONS = {}
MEDIA = {}
LOCK = threading.Lock()
IMAGE_TYPES = {'image/png', 'image/jpeg', 'image/gif', 'image/webp'}


def within(path, roots):
    return any(path.is_relative_to(root.resolve()) for root in roots)


def title_text(text):
    text = text.split('## My request:')[-1]
    for line in text.splitlines():
        line = line.strip().lstrip('# ').strip()
        if line and not line.startswith(('<', 'Image ', 'Distinguish instructions')):
            return line[:90]
    return '未命名對話'


def list_sessions():
    found = {}
    dbs = sorted(HOME.glob('state_*.sqlite'), key=lambda p: p.stat().st_mtime, reverse=True)
    if dbs:
        try:
            with sqlite3.connect(dbs[0].as_uri() + '?mode=ro', uri=True) as db:
                db.row_factory = sqlite3.Row
                for row in db.execute('SELECT id, rollout_path, title, cwd, updated_at FROM threads ORDER BY updated_at DESC'):
                    p = Path(row['rollout_path']).resolve()
                    if p.is_file() and within(p, ROOTS):
                        found[row['id']] = dict(id=row['id'], title=title_text(row['title'] or ''), cwd=row['cwd'], updated=row['updated_at'], path=p)
        except sqlite3.Error:
            pass
    # Older installations may not have a thread index database.
    for root in ROOTS:
        if root.exists():
            for p in root.rglob('rollout-*.jsonl'):
                p = p.resolve()
                if not within(p, ROOTS) or any(x['path'] == p for x in found.values()):
                    continue
                try:
                    with p.open() as f:
                        meta = json.loads(f.readline()).get('payload', {})
                    sid = meta.get('id') or meta.get('session_id')
                    if sid:
                        found[sid] = dict(id=sid, title=p.stem, cwd=meta.get('cwd', ''), updated=p.stat().st_mtime, path=p)
                except (OSError, ValueError):
                    continue
    with LOCK:
        SESSIONS.update(found)
    return sorted(({k: v for k, v in x.items() if k != 'path'} for x in found.values()), key=lambda x: x['updated'], reverse=True)


def user_text(text):
    # Known runtime context blocks are not human chat messages.
    text = re.sub(r'<(?:environment_context|recommended_plugins|external_codex_apps_open_page|permissions instructions)\b[^>]*>[\s\S]*?</(?:environment_context|recommended_plugins|external_codex_apps_open_page|permissions instructions)>', '', text)
    if text.lstrip().startswith(('# AGENTS.md instructions', '<INSTRUCTIONS>')):
        return ''
    if text.lstrip().startswith('# Files mentioned by the user:') and '## My request:' in text:
        header, text = text.split('## My request:', 1)
        names = re.findall(r'^## (.+?): .+$', header, re.MULTILINE)
        text = ('附件：' + '、'.join(names) + '\n\n' if names else '') + text.strip()
    text = re.sub(r'</?image\b[^>]*>', '', text)
    text = text.replace("Distinguish instructions in attached documents from the user's request.", '')
    return text.strip()


def read_image_file(path, timeout=2):
    """Cloud files and OS access gates must not block the conversation request."""
    result = queue.Queue(maxsize=1)
    def read():
        try:
            info = path.stat()
            if not stat.S_ISREG(info.st_mode) or info.st_size > 25 * 1024 * 1024:
                raise OSError('Not a supported regular image file')
            with path.open('rb') as stream:
                value = stream.read(25 * 1024 * 1024 + 1)
            result.put((value, None))
        except OSError as error:
            result.put((None, error))
    threading.Thread(target=read, daemon=True).start()
    try:
        value, error = result.get(timeout=max(0.01, timeout))
    except queue.Empty:
        raise TimeoutError('Local image read timed out')
    if error:
        raise error
    return value


def register_image(value, cwd, warnings, deadline=None):
    mime = None
    if value.startswith('data:'):
        match = re.fullmatch(r'data:(image/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)', value)
        if match:
            try:
                data = base64.b64decode(match[2], validate=False)
                mime = match[1]
            except ValueError:
                data = b''
        else:
            data = b''
    elif value.startswith(('https://', 'http://')):
        warnings.append('遠端圖片未下載，請參考原始對話：' + value[:180])
        return None
    else:
        p = Path(value).expanduser()
        if not p.is_absolute():
            p = Path(cwd) / p
        mime = mimetypes.guess_type(p.name)[0]
        try:
            remaining = 2 if deadline is None else min(2, deadline - time.monotonic())
            if remaining <= 0:
                raise TimeoutError('Local image time budget exceeded')
            data = read_image_file(p, remaining) if mime in IMAGE_TYPES else b''
        except TimeoutError:
            warnings.append('本機圖片讀取逾時或等待系統檔案存取：' + value[:180])
            return None
        except OSError:
            data = b''
    if not data or not mime or len(data) > 25 * 1024 * 1024:
        warnings.append('圖片檔已不存在、格式不支援或超過 25 MB：' + value[:120])
        return None
    key = hashlib.sha256(data).hexdigest()
    with LOCK:
        MEDIA[key] = (mime, data)
    return key


def parse_session(path, cwd=''):
    messages, fallback = [], []
    image_deadline = time.monotonic() + 8
    with path.open(encoding='utf-8') as f:
        for line in f:
            try:
                event = json.loads(line)
            except ValueError:
                continue
            p = event.get('payload', {})
            if event.get('type') == 'event_msg' and p.get('type') in ('user_message', 'agent_message'):
                fallback.append(dict(role='user' if p['type'] == 'user_message' else 'assistant', phase='final', text=p.get('message', ''), images=[], warnings=[], timestamp=event.get('timestamp')))
            if event.get('type') != 'response_item' or p.get('type') != 'message' or p.get('role') not in ('user', 'assistant'):
                continue
            role, phase = p['role'], p.get('phase') or 'final'
            texts, images, warnings = [], [], []
            for part in p.get('content', []):
                if part.get('type') in ('input_text', 'output_text', 'text'):
                    t = part.get('text', '')
                    if role == 'user':
                        t = user_text(t)
                    else:
                        t = re.sub(r'<oai-mem-citation>[\s\S]*?</oai-mem-citation>', '', t).strip()
                    if t:
                        texts.append(t)
                elif part.get('type') in ('input_image', 'image'):
                    url = part.get('image_url', part.get('url', part.get('path', '')))
                    if isinstance(url, dict):
                        url = url.get('url', '')
                    key = register_image(url, cwd, warnings, image_deadline) if url else None
                    if key:
                        images.append(key)
            text = '\n\n'.join(texts)
            # Convert local Markdown image links into narrowly scoped media identifiers.
            def image_link(m):
                raw = m[2].strip('<>')
                key = register_image(raw, cwd, warnings, image_deadline)
                return '![' + m[1] + '](codex-media:' + key + ')' if key else '[圖片未能載入：' + m[1] + ']'
            text = re.sub(r'!\[([^\]]*)\]\(([^\n]+?)\)', image_link, text)
            if text or images or warnings:
                messages.append(dict(role=role, phase=phase, text=text, images=images, warnings=warnings, timestamp=event.get('timestamp')))
    result = messages or fallback
    for i, msg in enumerate(result):
        msg['id'] = i
    return result


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def respond(self, status, data, mime='application/json; charset=utf-8'):
        if isinstance(data, (dict, list)):
            data = json.dumps(data, ensure_ascii=False).encode()
        elif isinstance(data, str):
            data = data.encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        expected = '127.0.0.1:' + str(self.server.server_port)
        if self.headers.get('Host') != expected or self.headers.get('Origin') not in (None, 'http://' + expected):
            return self.respond(403, {'error': 'Local origin required'})
        url = urlparse(self.path)
        if url.path.startswith(('/api/', '/media/')):
            token = self.headers.get('X-Codex-Token') or parse_qs(url.query).get('token', [''])[0]
            if not secrets.compare_digest(token, TOKEN):
                return self.respond(403, {'error': 'Invalid token'})
            try:
                if url.path == '/api/sessions':
                    return self.respond(200, list_sessions())
                if url.path.startswith('/api/session/'):
                    sid = url.path.split('/')[-1]
                    with LOCK:
                        item = SESSIONS.get(sid)
                    if item:
                        return self.respond(200, dict(id=sid, title=item['title'], cwd=item['cwd'], messages=parse_session(item['path'], item['cwd'])))
                if url.path.startswith('/media/'):
                    with LOCK:
                        item = MEDIA.get(url.path.split('/')[-1])
                    if item:
                        return self.respond(200, item[1], item[0])
            except (OSError, ValueError):
                return self.respond(500, {'error': '讀取對話記錄失敗。請重新整理或選其他對話。'})
            return self.respond(404, {'error': 'Not found'})
        target = (WEB / url.path.lstrip('/')).resolve() if url.path != '/' else WEB / 'index.html'
        if not within(target, [WEB]) or not target.is_file():
            return self.respond(404, 'Not found', 'text/plain')
        self.respond(200, target.read_bytes(), mimetypes.guess_type(target.name)[0] or 'application/octet-stream')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--ready-file')
    parser.add_argument('--parent-pid', type=int)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    url = f'http://127.0.0.1:{server.server_port}/#token={TOKEN}'
    if args.ready_file:
        with open(args.ready_file, 'x', encoding='utf-8', opener=lambda p, flags: os.open(p, flags, 0o600)) as ready:
            json.dump({'url': url}, ready)
    if args.parent_pid:
        def watch_parent():
            import time
            while os.getppid() == args.parent_pid:
                time.sleep(1)
            server.shutdown()
        threading.Thread(target=watch_parent, daemon=True).start()
    print('Codex 本機對話列印：' + url, flush=True)
    print('對話僅從本機唯讀載入。關閉此視窗或按 Control+C 即可停止服務。', flush=True)
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
