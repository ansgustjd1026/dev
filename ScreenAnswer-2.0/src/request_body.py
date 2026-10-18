"""Encode API JSON in memory without duplicating a complete JSON text string."""
import io
import json

STRING_CHUNK_SIZE = 64 * 1024


def _json_chunks(value):
    if isinstance(value, str):
        yield '"'
        for start in range(0, len(value), STRING_CHUNK_SIZE):
            # Each character chunk is escaped independently inside one JSON
            # string. Quotes, backslashes and Unicode keep their exact meaning.
            yield json.dumps(value[start:start + STRING_CHUNK_SIZE])[1:-1]
        yield '"'
    elif isinstance(value, dict):
        yield '{'
        for index, (key, item) in enumerate(value.items()):
            if not isinstance(key, str):
                raise TypeError('API JSON object keys must be strings.')
            if index:
                yield ','
            yield json.dumps(key)
            yield ':'
            yield from _json_chunks(item)
        yield '}'
    elif isinstance(value, (list, tuple)):
        yield '['
        for index, item in enumerate(value):
            if index:
                yield ','
            yield from _json_chunks(item)
        yield ']'
    else:
        yield json.dumps(value, allow_nan=False)


def encode_request(data):
    # Keep the body as ordinary bytes for urllib's Content-Length handling.
    # No request contents or temporary files are written to disk.
    with io.BytesIO() as body:
        for chunk in _json_chunks(data):
            body.write(chunk.encode('ascii'))
        return body.getvalue()
