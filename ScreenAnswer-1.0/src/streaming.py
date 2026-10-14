"""Read Responses SSE and expose only the answer inside the JSON envelope."""
import json
import re
import time

ANSWER_START = re.compile(r'^\s*\{\s*(?:"led_count"\s*:\s*[1-9]\s*,\s*)?"answer"\s*:\s*"')


def partial_answer(raw):
    match = ANSWER_START.match(raw)
    if not match:
        return ''
    start = match.end()
    end = start
    while end < len(raw):
        if raw[end] == '"':
            break
        length = 1
        if raw[end] == '\\':
            if end + 1 >= len(raw):
                break
            length = 6 if raw[end + 1] == 'u' else 2
            if end + length > len(raw):
                break
        end += length
    try:
        answer = json.loads('"' + raw[start:end] + '"')
        # A streamed Unicode escape can end between the halves of an emoji.
        return answer.encode('utf-16-le', 'surrogatepass').decode('utf-16-le', 'ignore')
    except ValueError:
        return ''


def stream_response(response, on_progress):
    fields, size, raw = [], 0, ''
    last_update, last_answer, source = 0, '', None
    while True:
        line = response.readline(2 * 1024 * 1024 + 1)
        if not line:
            raise ValueError('번역 연결이 중단되었습니다. 다시 시도하세요.')
        size += len(line)
        if size > 2 * 1024 * 1024:
            raise ValueError('번역 응답 크기가 너무 큽니다. 입력을 줄여 주세요.')
        if line.strip():
            if line.startswith(b'data:'):
                fields.append(line[5:].strip())
            continue
        if not fields:
            size = 0
            continue
        event = json.loads(b'\n'.join(fields))
        fields, size = [], 0
        kind = event.get('type')
        if kind == 'response.completed':
            return event['response']
        if kind in ('response.failed', 'response.incomplete', 'error'):
            raise ValueError('번역 응답이 완료되지 않았습니다. 입력을 줄이거나 다시 시도하세요.')
        if kind != 'response.output_text.delta':
            continue
        identity = (event.get('item_id'), event.get('content_index'))
        if source is None:
            source = identity
        if identity != source:
            continue
        raw += event.get('delta', '')
        if len(raw) > 1024 * 1024:
            raise ValueError('번역 응답 크기가 너무 큽니다. 입력을 줄여 주세요.')
        now = time.monotonic()
        if not last_answer or now - last_update >= .25:
            answer = partial_answer(raw)
            if answer and answer != last_answer:
                on_progress(answer)
                last_answer, last_update = answer, now
