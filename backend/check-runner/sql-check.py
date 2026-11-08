import io
import json
import sys

import pymysql
from pymysql.constants import CLIENT
from pymysql.charset import charset_by_id
from pymysql.cursors import SSCursor


MAX_OUTPUT = 40 * 1024 * 1024


def execute(request):
    connection = pymysql.connect(
        unix_socket="/var/run/mysqld/mysqld.sock",
        user=request["user"],
        database="exercise" if request["database"] else None,
        charset="utf8mb4",
        use_unicode=False,
        conv={},  # Keep MySQL's text protocol values, including numeric formatting.
        # Queries use one fresh UTF-8 session and one statement: a preceding SET
        # must not change how MySQL converts result text before it reaches us.
        client_flag=0 if request["rows"] else CLIENT.MULTI_STATEMENTS,
        autocommit=True,
        local_infile=False,
    )
    try:
        cursor = connection.cursor(SSCursor)
        cursor.execute(request["sql"])
        output = None
        while True:
            if request["rows"] and cursor.description is not None:
                if output is not None:
                    return b"INVALID_RESULT"
                if len(cursor.description) > 30:
                    return b"RESOURCE_LIMIT"
                output = io.BytesIO(b"[")
                output.seek(1)
                # MySQL reports the actual wire charset for each column. A student
                # can change character_set_results; assuming UTF-8 could change
                # the meaning of bytes and incorrectly accept a different answer.
                encodings = [
                    "utf-8" if field.charsetnr == 63 else charset_by_id(field.charsetnr).encoding
                    for field in cursor._result.fields
                ]
                for row_number, row in enumerate(cursor):
                    if row_number >= 100:
                        return b"RESOURCE_LIMIT"
                    if output.tell() + sum(len(value) for value in row if value is not None) >= MAX_OUTPUT:
                        return b"RESOURCE_LIMIT"
                    if output.tell() > 1:
                        output.write(b",")
                    try:
                        cells = [value.decode(encoding) if value is not None else None
                                 for value, encoding in zip(row, encodings)]
                    except (UnicodeDecodeError, LookupError):
                        return b"NON_TEXT_RESULT"
                    if any(cell is not None and len(cell) > 2000 for cell in cells):
                        return b"RESOURCE_LIMIT"
                    output.write(json.dumps(cells, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
                    if output.tell() >= MAX_OUTPUT:
                        return b"RESOURCE_LIMIT"
                output.write(b"]")
            elif cursor.description is not None:
                for _ in cursor:
                    pass
            if not cursor.nextset():
                break
        if request["rows"]:
            return b"INVALID_RESULT" if output is None else output.getvalue()
        return b"OK"
    finally:
        connection.close()


def main():
    try:
        output = execute(json.load(sys.stdin))
    except pymysql.MySQLError as error:
        code = error.args[0]
        if not isinstance(code, int):
            output = b"INTERNAL"
        else:
            output = b"UNAVAILABLE" if 2000 <= code < 3000 else b"SQL_ERROR"
    except Exception:
        output = b"INTERNAL"
    sys.stdout.buffer.write(output)


if __name__ == "__main__":
    main()
