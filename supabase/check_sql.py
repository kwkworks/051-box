"""SQL 파일 괄호 짝 검사 (SQL Editor에 붙여넣기 전에 실행)

사용법: python supabase/check_sql.py supabase/tests/rls_test.sql supabase/migrations/0006_chat_today_all.sql

문자열('...', 'it''s'), 달러 인용($$...$$), 주석(--, /* */) 안의 괄호는 세지 않고,
세미콜론으로 끝나는 문장마다 ( ) 개수가 맞는지 확인한다. 어긋나면 줄 번호를 알려준다.
"""
import re
import sys


def check(path: str, text: str | None = None, first_line: int = 1) -> int:
    if text is None:
        text = open(path, encoding='utf-8').read()
    i, n, line = 0, len(text), first_line
    depth, stmt_line, errors = 0, first_line, 0
    while i < n:
        c = text[i]
        if c == '\n':
            line += 1
            i += 1
        elif text.startswith('--', i):
            j = text.find('\n', i)
            i = n if j < 0 else j
        elif text.startswith('/*', i):
            j = text.find('*/', i + 2)
            line += text[i:j].count('\n')
            i = n if j < 0 else j + 2
        elif c == '$':
            m = re.match(r'\$[A-Za-z_]*\$', text[i:])
            if m:
                tag = m.group(0)
                j = text.find(tag, i + len(tag))
                body = text[i + len(tag):j]
                # 함수 본문 안도 따로 검사
                errors += check(path, body, line)
                line += text[i:j + len(tag)].count('\n')
                i = n if j < 0 else j + len(tag)
            else:
                i += 1
        elif c == "'":
            j = i + 1
            while j < n:
                if text[j] == "'" and j + 1 < n and text[j + 1] == "'":
                    j += 2
                elif text[j] == "'":
                    break
                else:
                    j += 1
            line += text[i:j].count('\n')
            i = j + 1
        elif c == '(':
            depth += 1
            i += 1
        elif c == ')':
            depth -= 1
            if depth < 0:
                print(f'{path}:{line}: 닫는 괄호 ")"가 하나 더 많아요')
                errors += 1
                depth = 0
            i += 1
        elif c == ';':
            if depth != 0:
                print(f'{path}:{stmt_line}~{line}: 여는 괄호 "("가 {depth}개 덜 닫혔어요')
                errors += 1
            depth = 0
            stmt_line = line + (1 if i + 1 < n and text[i + 1] == '\n' else 0)
            i += 1
        else:
            i += 1
    return errors


if __name__ == '__main__':
    total = sum(check(p) for p in sys.argv[1:])
    print('✅ 괄호 짝 모두 맞음' if total == 0 else f'❌ 문제 {total}개')
    sys.exit(1 if total else 0)
