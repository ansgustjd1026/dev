"""Bounded local reference file inputs. No uploads or persistent copies here."""
import base64
import io
import re
from pathlib import Path

MAX_BYTES = 50_000_000
READ_CHUNK_BYTES = 3 * 256 * 1024
MIME_TYPES = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}


def validate_vector_store_id(value):
    value = str(value).strip()
    if not re.fullmatch(r'vs_[A-Za-z0-9]+', value):
        raise ValueError('vs_로 시작하는 올바른 저장소 ID를 입력하세요.')
    return value


def validate_reference_paths(paths):
    if not isinstance(paths, (list, tuple)):
        raise ValueError('참고 파일 목록이 올바르지 않습니다. 설정에서 다시 선택하세요.')
    selected, seen, total = [], set(), 0
    for name in paths:
        try:
            path = Path(name).resolve(strict=True)
            if not path.is_file():
                raise ValueError('참고 파일은 폴더가 아닌 파일을 선택하세요.')
            if path.suffix.lower() not in MIME_TYPES:
                raise ValueError('참고 파일은 PDF, TXT, MD, DOCX, PPTX를 지원합니다.')
            if path in seen:
                continue
            size = path.stat().st_size
            if size == 0:
                raise ValueError('빈 참고 파일은 첨부할 수 없습니다: ' + path.name)
            if size >= MAX_BYTES or total + size > MAX_BYTES:
                raise ValueError('참고 파일은 각각 50MB 미만, 전체 합계 50MB 이하여야 합니다.')
            total += size
            seen.add(path)
            selected.append(str(path))
        except (OSError, TypeError) as error:
            raise ValueError('참고 파일을 찾거나 읽을 수 없습니다. 설정에서 파일 위치를 확인하세요.') from error
    return selected


def reference_inputs(settings):
    if settings.get('file_search_enabled', False):
        return []  # Server search replaces retransmission of local files.
    if not settings.get('reference_files_enabled', False):
        return []
    parts, total = [], 0
    for name in validate_reference_paths(settings.get('reference_files', ())):
        path = Path(name)
        try:
            with path.open('rb') as stream, io.BytesIO() as encoded:
                encoded.write(('data:' + MIME_TYPES[path.suffix.lower()] + ';base64,').encode('ascii'))
                size, remainder = 0, b''
                while True:
                    chunk = stream.read(min(READ_CHUNK_BYTES, MAX_BYTES - size, MAX_BYTES - total - size + 1))
                    if not chunk:
                        break
                    size += len(chunk)
                    if size >= MAX_BYTES or total + size > MAX_BYTES:
                        raise ValueError('참고 파일 크기가 변경됐거나 허용 크기를 넘었습니다. 파일을 다시 확인하세요.')
                    chunk = remainder + chunk
                    complete = len(chunk) - len(chunk) % 3
                    encoded.write(base64.b64encode(chunk[:complete]))
                    remainder = chunk[complete:]
                if not size:
                    raise ValueError('참고 파일이 비어 있습니다. 파일을 다시 확인하세요.')
                if remainder:
                    encoded.write(base64.b64encode(remainder))
                file_data = encoded.getvalue().decode('ascii')
        except OSError as error:
            raise ValueError('참고 파일을 읽을 수 없습니다: ' + path.name) from error
        total += size
        parts.append({'type': 'input_file', 'filename': path.name,
                      'file_data': file_data})
    return parts
