import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import urllib.request
import urllib.error
import threading
import stat
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('server', Path(__file__).with_name('server.py'))
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


class ParserTests(unittest.TestCase):
    def test_stalled_local_image_cannot_hang_the_export(self):
        released = threading.Event()
        class StalledImage:
            def stat(self):
                return SimpleNamespace(st_mode=stat.S_IFREG, st_size=5)
            def open(self, *_):
                released.wait(2)
                raise OSError('unavailable')
        try:
            with self.assertRaises(TimeoutError):
                s.read_image_file(StalledImage(), timeout=0.03)
        finally:
            released.set()

    def test_roles_metadata_duplicates_and_images(self):
        records = [
            {'type': 'event_msg', 'payload': {'type': 'user_message', 'message': 'duplicate'}},
            {'type': 'response_item', 'payload': {'type': 'message', 'role': 'developer', 'content': [{'type': 'input_text', 'text': 'private instructions'}]}},
            {'type': 'response_item', 'payload': {'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': '<environment_context>hidden</environment_context>'}, {'type': 'input_text', 'text': '請列印'}]}},
            {'type': 'response_item', 'payload': {'type': 'message', 'role': 'assistant', 'phase': 'final_answer', 'content': [{'type': 'output_text', 'text': r'答案 $x^2$'}]}},
            {'type': 'response_item', 'payload': {'type': 'function_call', 'arguments': 'secret'}},
        ]
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'rollout.jsonl'
            path.write_text('\n'.join(json.dumps(x) for x in records))
            actual = s.parse_session(path)
        self.assertEqual([x['text'] for x in actual], ['請列印', r'答案 $x^2$'])
        self.assertEqual(actual[1]['phase'], 'final_answer')
        warnings = []
        self.assertIsNone(s.register_image('https://example.com/image.png', '', warnings))
        self.assertEqual(len(warnings), 1)

    def test_server_token_host_and_static_boundaries(self):
        http = s.ThreadingHTTPServer(('127.0.0.1', 0), s.Handler)
        worker = threading.Thread(target=http.serve_forever, daemon=True)
        worker.start()
        base = 'http://127.0.0.1:' + str(http.server_port)
        try:
            with urllib.request.urlopen(base + '/') as response:
                self.assertIn(b'Codex', response.read())
            for path, headers, expected in [
                ('/api/sessions', {}, 403),
                ('/api/sessions', {'X-Codex-Token': s.TOKEN, 'Origin': 'https://example.com'}, 403),
                ('/api/sessions', {'X-Codex-Token': s.TOKEN, 'Host': 'example.com'}, 403),
                ('/../server.py', {}, 404),
                ('/api/session/unknown', {'X-Codex-Token': s.TOKEN}, 404),
            ]:
                with self.assertRaises(urllib.error.HTTPError) as err:
                    urllib.request.urlopen(urllib.request.Request(base + path, headers=headers))
                self.assertEqual(err.exception.code, expected)
        finally:
            http.shutdown()
            http.server_close()


if __name__ == '__main__':
    unittest.main()
