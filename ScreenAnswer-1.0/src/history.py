"""Local date/ID index; original text and answers are fetched from OpenAI."""
from contextlib import closing
from datetime import datetime
import json
from pathlib import Path
import re
import sqlite3
import urllib.request
import urllib.error
import urllib.parse

from settings_store import APP_DIR

SOURCE_PREFIX = '아래는 사용자가 선택한 텍스트입니다. 이미지는 없습니다. 지정한 작업을 이 내용에 적용하세요.\n\n'


def response_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'resp_[A-Za-z0-9_-]{1,200}', value):
        raise ValueError('올바른 응답 ID가 아닙니다.')
    return value


class HistoryIndex:
    def __init__(self, path=None):
        self.path = Path(path) if path else APP_DIR / 'history-index.sqlite3'

    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute('CREATE TABLE IF NOT EXISTS responses (id TEXT PRIMARY KEY, created REAL NOT NULL, day TEXT NOT NULL, clock TEXT NOT NULL, task TEXT NOT NULL, kind TEXT NOT NULL)')
        return db

    def add(self, data, task, kind):
        identity = response_id(data['id'])
        created = float(data['created_at'])
        local = datetime.fromtimestamp(created).astimezone()
        with closing(self.connect()) as db, db:
            db.execute('INSERT OR IGNORE INTO responses VALUES (?, ?, ?, ?, ?, ?)',
                       (identity, created, local.strftime('%Y-%m-%d'), local.strftime('%H:%M:%S'),
                        str(task), kind))

    def days(self):
        with closing(self.connect()) as db:
            return [row[0] for row in db.execute('SELECT DISTINCT day FROM responses ORDER BY day DESC')]

    def entries(self, day):
        with closing(self.connect()) as db:
            return [dict(row) for row in db.execute(
                'SELECT * FROM responses WHERE day = ? ORDER BY created DESC, id DESC', (day,))]


def get_json(path, key, timeout=20):
    request = urllib.request.Request('https://api.openai.com/v1/' + path,
                                     headers={'Authorization': 'Bearer ' + key}, method='GET')
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(16 * 1024 * 1024 + 1)
            if len(raw) > 16 * 1024 * 1024:
                raise ValueError('기록이 너무 커서 불러올 수 없습니다.')
            return json.loads(raw)
    except urllib.error.HTTPError as error:
        messages = {401: 'API 키를 확인해 주세요.', 403: '이 기록에 접근할 API 권한이 없습니다.',
                    404: '기록이 만료·삭제되었거나 현재 API 프로젝트에서 조회할 수 없습니다.',
                    429: '조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.'}
        raise ValueError(messages.get(error.code, 'API 기록 조회에 실패했습니다. 다시 시도해 주세요.')) from None
    except (urllib.error.URLError, TimeoutError):
        raise ValueError('API에 연결하지 못했습니다. 네트워크를 확인해 주세요.') from None


def retrieve(identity, key, kind):
    from api_client import response_text
    from led_response import parse_result
    identity = response_id(identity)
    data = get_json('responses/' + identity, key)
    answer = response_text(data)
    try:
        answer = parse_result(answer)['answer']
    except ValueError:
        pass  # Dedicated classification responses are plain text.
    if kind == 'screen':
        return '화면 캡처로 요청한 기록입니다. 텍스트 원문은 없습니다.', answer
    after, seen = None, set()
    for _ in range(100):
        query = '?limit=100&order=asc'
        if after:
            query += '&after=' + urllib.parse.quote(after, safe='')
        page = get_json('responses/' + identity + '/input_items' + query, key)
        for item in page.get('data', []):
            if item.get('role') != 'user':
                continue
            for content in item.get('content', []):
                text = content.get('text', '')
                if content.get('type') == 'input_text' and text.startswith(SOURCE_PREFIX):
                    return text[len(SOURCE_PREFIX):], answer
        if not page.get('has_more'):
            return '이 기록에서 선택 원문을 찾지 못했습니다.', answer
        after = page.get('last_id')
        if not isinstance(after, str) or after in seen:
            break
        seen.add(after)
    raise ValueError('원문 목록을 모두 조회하지 못했습니다. 다시 시도해 주세요.')
