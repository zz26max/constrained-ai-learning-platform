"""Validate the shared design contract; does not call the API or touch a database."""
from pathlib import Path
from collections import Counter
from copy import deepcopy
from urllib.parse import unquote
import re
import sys

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate_spec
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012
from contract_slice import extract

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
SPEC = yaml.safe_load((DOCS / 'openapi.yaml').read_text(encoding='utf-8'))
BASE = 'urn:learning-platform:contract'
REGISTRY = Registry().with_resource(BASE, Resource.from_contents(SPEC, default_specification=DRAFT202012))
METHODS = {'get', 'post', 'put', 'patch', 'delete'}


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def resolve(value):
    if '$ref' not in value:
        return value
    target = SPEC
    check(value['$ref'].startswith('#/'), 'Only local contract references are allowed')
    for part in value['$ref'][2:].split('/'):
        target = target[part.replace('~1', '/').replace('~0', '~')]
    return target


def validate_schema(schema, instance):
    def qualify(value):
        if isinstance(value, dict):
            return {k: BASE + v if k == '$ref' and v.startswith('#/') else qualify(v) for k, v in value.items()}
        if isinstance(value, list):
            return [qualify(v) for v in value]
        return value
    return list(Draft202012Validator(
        qualify(schema), registry=REGISTRY, format_checker=FormatChecker()
    ).iter_errors(instance))


def assert_case(name, schema, value, valid):
    errors = validate_schema(schema, value)
    check(bool(errors) != valid, f'{name}: expected valid={valid}; errors={[e.message for e in errors[:2]]}')


def schema_ref(name):
    return {'$ref': '#/components/schemas/' + name}


def assignment_counts_valid(page, selected_filter):
    """Check documented arithmetic for fixtures; real query isolation requires backend tests."""
    summary = page['summary']
    total_key = {'all': 'allCount', 'todo': 'todoCount', 'done': 'doneCount'}[selected_filter]
    return (summary['allCount'] == sum(summary[k] for k in ('todoCount', 'doneCount', 'archivedIncompleteCount'))
            and page['total'] == summary[total_key])


def slug(text):
    return re.sub(r'[^\w\- ]', '', text.lower()).replace(' ', '-')


def check_links():
    count = 0
    # Historical snapshots retain historical coordinates; only current documents are normative.
    for path in [ROOT / 'README.md', *[DOCS / n for n in ['DEVELOPMENT.md', 'FRONTEND.md', 'BACKEND.md']]]:
        content = path.read_text(encoding='utf-8')
        for target in re.findall(r'\[[^\]\n]+\]\(([^)\n]+)\)', content):
            if re.match(r'^[a-z]+://', target, re.I):
                continue
            target = unquote(target.strip('<>'))
            filename, _, anchor = target.partition('#')
            dest = (path.parent / filename).resolve() if filename else path
            check(dest.is_file(), f'{path.name}: missing link {target}')
            if anchor and dest.suffix == '.md':
                other = dest.read_text(encoding='utf-8')
                anchors = {slug(h.strip()) for h in re.findall(r'^#{1,6} (.+)$', other, re.M)}
                anchors.update(re.findall(r'<a id="([^"]+)"', other))
                check(anchor in anchors, f'{path.name}: missing anchor {target}')
            elif anchor and dest.suffix in {'.yaml', '.yml'}:
                check(anchor.startswith('/'), f'{path.name}: expected YAML JSON Pointer {target}')
                node = SPEC if dest == DOCS / 'openapi.yaml' else yaml.safe_load(dest.read_text(encoding='utf-8'))
                for part in anchor[1:].split('/'):
                    part = part.replace('~1', '/').replace('~0', '~')
                    check(isinstance(node, dict) and part in node, f'{path.name}: missing YAML target {target}')
                    node = node[part]
            count += 1
    return count


def check_windows_scripts():
    """Windows PowerShell 5.1 在非 UTF-8 代码页（如 936）下按 ANSI 读取无 BOM 的脚本，中文会破坏解析。

    backend/scripts/Start-Local.ps1 曾因丢失 BOM 而整个脚本无法解析，启动路径静默失效；
    编辑器与工具会顺手去掉 BOM，因此把这条约束纳入静态检查。
    """
    checked = 0
    for path in sorted((ROOT / 'backend' / 'scripts').glob('*.ps1')):
        data = path.read_bytes()
        check(data.startswith(b'\xef\xbb\xbf'),
              f'{path.name}: Windows PowerShell 脚本必须带 UTF-8 BOM，否则中文在 936 等代码页下无法解析')
        checked += 1
    check(checked > 0, '未发现任何 Windows PowerShell 脚本，该检查可能已失效')
    return checked


def main():
    validate_spec(SPEC)
    operations = [(p, m, op) for p, item in SPEC['paths'].items() for m, op in item.items() if m in METHODS]
    business = [(p, m, op) for p, m, op in operations if p.startswith('/api/v1/')]
    ids = [op['operationId'] for _, _, op in operations]
    check(len(set(ids)) == len(ids), 'Duplicate operationId')
    previous = (DOCS / 'archive/2026-10-08_API.md').read_text(encoding='utf-8')
    previous = previous.split('## 7. 核心联调')[0]
    inventory = set(re.findall(r'^\|[^\n]*?`(GET|POST|PUT|PATCH|DELETE) (/[^`]+)`', previous, re.M))
    current = {(m.upper(), p.removeprefix('/api/v1')) for p, m, _ in business}
    check(inventory <= current, f'Missing baseline endpoints: {inventory - current}')
    count_examples = 0

    def walk(value, location='root'):
        nonlocal count_examples
        if isinstance(value, dict):
            if '$ref' in value:
                resolve(value)
            # Schemas must specify object shape, not an unconstrained placeholder.
            if value.get('type') == 'object':
                check('properties' in value and value.get('additionalProperties') is False,
                      f'{location}: unconstrained object')
                check(set(value.get('required', [])) <= set(value['properties']), f'{location}: unknown required field')
            if 'examples' in value and isinstance(value['examples'], list):
                for example in value['examples']:
                    assert_case(location, value, example, True)
                    count_examples += 1
            for k, v in value.items():
                if k not in {'examples', 'example'}:
                    walk(v, location + '/' + str(k))
        elif isinstance(value, list):
            for i, v in enumerate(value):
                walk(v, location + '/' + str(i))
    walk(SPEC)
    for path, method, op in operations:
        for key in ['x-phase', 'x-implementation-status', 'x-contract-status', 'x-permission', 'x-csrf-required', 'x-idempotency']:
            check(key in op, f'{op["operationId"]}: missing {key}')
        check(op['x-implementation-status'] in {'planned', 'implemented', 'verified'}, 'Invalid implementation status')
        params = op.get('parameters', [])
        declared = {p['name'] for p in params if p['in'] == 'path' and p['required']}
        check(declared == set(re.findall(r'{(.*?)}', path)), f'{path}: path parameters mismatch')
        if path.startswith('/api/v1/') and method != 'get':
            check(op['x-csrf-required'], f'{path}: write without CSRF')
            check(any(p['name'] == 'X-CSRF-Token' and p['required'] for p in params), 'Missing required CSRF parameter')
        if op['x-idempotency'] == 'required':
            check(any(p['name'] == 'Idempotency-Key' and p['required'] for p in params), 'Missing idempotency parameter')
        for status, response in op['responses'].items():
            response = resolve(response)
            check('schema' in response['content']['application/json'], f'{path}/{status}: missing schema')
            schema = resolve(response['content']['application/json']['schema'])
            for variant in schema.get('oneOf', []):
                variant = resolve(variant)
                if 'error' in variant.get('properties', {}):
                    error = resolve(variant['properties']['error'])
                    check(str(error['x-http-status']) == status, f'{path}: error mapped to wrong HTTP status')

    uid = '00000000-0000-4000-8000-000000000001'
    now = '2026-10-11T02:00:00Z'
    examples = SPEC['components']['schemas']
    for name in ['AssignmentState', 'SaveBlockedReason', 'SubmissionBlockedReason']:
        check(bool(examples[name].get('description')), f'{name}: missing domain explanation')
    check(bool(examples['ChapterProgress']['properties']['status'].get('description')), 'Missing chapter status explanation')
    detail_ids = ['getOffering', 'listChapters', 'getChapter', 'getResource', 'getAssignment', 'getSubmission']
    detail_slice = extract(SPEC, detail_ids)
    validate_spec(detail_slice)
    for name in detail_ids:
        check(bool(detail_slice['components']['schemas']['Response_' + name].get('examples')),
              f'{name}: full response examples must survive extraction')
    cases = []
    def case(name, schema, value, valid=True):
        cases.append((name, schema_ref(schema), deepcopy(value), valid))
    case('PATCH can unbind knowledge point', 'ResourcePatch', {'knowledgePointId': None})
    case('PATCH can omit unchanged binding', 'ResourcePatch', {'title': '修改资料'})
    case('PATCH cannot null title', 'ResourcePatch', {'title': None}, False)
    case('PATCH cannot include unknown key', 'ResourcePatch', {'fake': True}, False)
    case('PATCH cannot be empty', 'ResourcePatch', {}, False)
    case('position exactly one target', 'LearningPositionWrite', {'offeringId': uid, 'chapterId': uid})
    case('position rejects two targets', 'LearningPositionWrite', {'offeringId': uid, 'chapterId': uid, 'assignmentId': uid}, False)
    case('position requires target', 'LearningPositionWrite', {'offeringId': uid}, False)
    case('score is number', 'Score', 85.5)
    case('score is not string', 'Score', '85.5', False)
    case('score precision', 'Score', 85.555, False)
    case('assignment case matters', 'AssignmentState', 'in_progress', False)
    case('timestamp normalized UTC', 'Timestamp', now)
    case('timestamp rejects offset', 'Timestamp', '2026-10-11T10:00:00+08:00', False)
    workspace = {'assignmentId': uid, 'revision': 0, 'files': [{'path': 'answer.md', 'content': ''}], 'activeFile': 'answer.md', 'savedAt': None, 'canSave': True, 'saveBlockedReason': None}
    case('workspace template', 'WorkspaceDTO', workspace)
    case('workspace false requires reason', 'WorkspaceDTO', {**workspace, 'canSave': False}, False)
    case('saved revision requires savedAt', 'WorkspaceDTO', {**workspace, 'revision': 1}, False)
    case('unregistered HTTP error', 'Failure_INVALID_REQUEST', {'error': {'code': 'CUSTOM_FAILURE', 'message': '失败', 'details': {}}, 'requestId': 'req-test'}, False)
    case('student summary hides draft', 'SubmissionSummaryDTO', {**examples['SubmissionSummaryDTO']['examples'][0], 'feedbackStatus': 'draft'}, False)
    complete = deepcopy(examples['TutoringRequestDTO']['examples'][0])
    case('AI completed example', 'TutoringRequestDTO', complete)
    case('AI running cannot carry result', 'TutoringRequestDTO', {**complete, 'status': 'running'}, False)
    failed = {**complete, 'status': 'failed', 'result': None, 'error': {'code': 'PROVIDER_UNAVAILABLE', 'message': '暂不可用'}}
    case('AI failed has no answer', 'TutoringRequestDTO', failed)
    case('AI failed requires error', 'TutoringRequestDTO', {**failed, 'error': None}, False)
    expired = deepcopy(complete)
    expired['result']['content'] = None
    expired['result']['contentUnavailableReason'] = 'retention_expired'
    case('AI retention preserves completed', 'TutoringRequestDTO', expired)
    expired['result']['content'] = '不能再公开的正文'
    case('AI expired content cannot leak', 'TutoringRequestDTO', expired, False)
    case('ask needs content', 'TutoringWrite', {'action': 'ask', 'content': ''}, False)
    case('concept permits empty content', 'TutoringWrite', {'action': 'concept', 'content': ''})
    case('event cannot forge score', 'LearningEventsWrite', {'events': [{'eventId': uid, 'sessionId': uid, 'occurredAt': now, 'offeringId': uid, 'type': 'active_heartbeat', 'payload': {'visible': True, 'score': 100}}]}, False)
    detail = {**deepcopy(examples['AssignmentWriteDTO']['examples'][0]),
              **deepcopy(examples['DashboardDTO']['examples'][0]['otherPendingAssignments'][0]),
              'attemptsUsed': 0, 'canSubmit': True, 'submissionBlockedReason': None}
    detail.pop('initialFiles')
    case('student may submit', 'AssignmentDetailDTO', detail)
    case('submission eligibility needs reason', 'AssignmentDetailDTO', {**detail, 'canSubmit': False}, False)
    case('submission reason cannot coexist with allowed', 'AssignmentDetailDTO', {**detail, 'submissionBlockedReason': 'SUBMISSION_CLOSED'}, False)
    teacher_detail = deepcopy(detail)
    for key in ['assignmentState', 'overdue', 'latestSubmissionId', 'publishedFeedbackId', 'unreadFeedback', 'attemptsUsed', 'canSubmit', 'submissionBlockedReason']:
        teacher_detail[key] = None
    case('teacher has no student personal state', 'TeacherAssignmentViewDTO', teacher_detail)
    case('teacher cannot carry another student state', 'TeacherAssignmentViewDTO', {**teacher_detail, 'assignmentState': 'REVIEWED'}, False)
    case('chapter complete requires timestamp', 'ChapterProgress', {'status': 'completed', 'completedAt': None}, False)
    case('chapter rejects assignment casing', 'ChapterProgress', {'status': 'IN_PROGRESS', 'completedAt': None}, False)
    case('chapter learning state', 'ChapterProgress', {'status': 'in_progress', 'completedAt': None})
    case('save cannot use submission-only reason', 'SaveBlockedReason', 'SUBMISSION_CLOSED', False)
    case('submission reason casing', 'SubmissionBlockedReason', 'submission_closed', False)
    student_submission = examples['Response_getSubmission']['examples'][0]['data']
    case('student submission cannot expose draft status', 'SubmissionDetailDTO', {**student_submission, 'feedbackStatus': 'draft'}, False)
    case('student submission cannot expose draft field', 'SubmissionDetailDTO', {**student_submission, 'draftFeedback': None}, False)
    page = examples['AssignmentPage']['examples'][0]
    check(assignment_counts_valid(page, 'all'), 'AssignmentPage example violates count identity or filter total')
    broken = deepcopy(page)
    broken['summary']['allCount'] += 1
    check(not assignment_counts_valid(broken, 'all'), 'Count identity regression was not detected')
    for selected in ('todo', 'done'):
        filtered = deepcopy(page)
        filtered['total'] = page['summary'][selected + 'Count']
        check(assignment_counts_valid(filtered, selected), 'Changing filter must retain summary')
    broken = deepcopy(page)
    broken['total'] = 0
    check(not assignment_counts_valid(broken, 'all'), 'Empty out-of-range page must retain total')
    for args in cases:
        assert_case(*args)
    sliced = extract(SPEC, ['login', 'getMe', 'getConfig'])
    validate_spec(sliced)
    check(len(sliced['paths']) == 3, 'Contract slice selected unexpected paths')
    check('AssignmentDetailDTO' not in sliced['components']['schemas'], 'Contract slice includes unrelated schemas')
    links = check_links()
    scripts = check_windows_scripts()
    print(f'PASS: OpenAPI 3.1; {len(business)} business + {len(operations)-len(business)} health operations; {len(examples)} schemas')
    print(f'PASS: baseline coverage, local refs, permissions metadata, error/status mapping; {count_examples} examples; {len(cases)} regression cases; {links} current-document links')
    print('PASS: six detail-response slices retain examples; five count/filter fixture checks (not live queries)')
    print(f'PASS: {scripts} Windows PowerShell script(s) keep their UTF-8 BOM')
    print('Implementation states:', dict(Counter(op['x-implementation-status'] for _, _, op in operations)))
    print('Static validation only. No claim of HTTP integration, authorization, database or concurrency correctness.')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    try:
        main()
    except Exception as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        sys.exit(1)
