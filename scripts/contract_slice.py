"""Read-only contract extraction for a small frontend/backend work package."""
from argparse import ArgumentParser
from copy import deepcopy
from pathlib import Path
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
METHODS = {'get', 'post', 'put', 'patch', 'delete'}


def extract(spec, operation_ids):
    wanted = set(operation_ids)
    result = {k: deepcopy(v) for k, v in spec.items() if k not in {'paths', 'components'}}
    result['paths'] = {}
    result['components'] = {'securitySchemes': deepcopy(spec['components']['securitySchemes'])}
    found = set()
    for path, item in spec['paths'].items():
        selected = {m: deepcopy(op) for m, op in item.items()
                    if m in METHODS and op['operationId'] in wanted}
        if selected:
            result['paths'][path] = selected
            found.update(op['operationId'] for op in selected.values())
    if wanted != found:
        raise ValueError('Unknown operationId: ' + ', '.join(sorted(wanted - found)))

    def refs(value):
        if isinstance(value, dict):
            if '$ref' in value:
                yield value['$ref']
            for item in value.values():
                yield from refs(item)
        elif isinstance(value, list):
            for item in value:
                yield from refs(item)

    pending = list(refs(result))
    visited = set()
    while pending:
        pointer = pending.pop()
        if pointer in visited:
            continue
        visited.add(pointer)
        pieces = pointer.split('/')
        if len(pieces) != 4 or pieces[:2] != ['#', 'components']:
            raise ValueError('Unsupported reference: ' + pointer)
        _, _, group, name = pieces
        value = deepcopy(spec['components'][group][name])
        result['components'].setdefault(group, {})[name] = value
        pending.extend(refs(value))
    result['info']['description'] += '\n按 operationId 提取的只读视图；修改仍回到 docs/openapi.yaml，不维护此输出副本。'
    return result


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('operation_ids', nargs='*', help='Example: login getMe getConfig')
    parser.add_argument('--list', action='store_true', help='List operationIds, phases and implementation states')
    args = parser.parse_args()
    spec = yaml.safe_load((ROOT / 'docs/openapi.yaml').read_text(encoding='utf-8'))
    sys.stdout.reconfigure(encoding='utf-8')
    if args.list:
        for path, item in spec['paths'].items():
            for method, op in item.items():
                if method in METHODS:
                    print(f"{op['operationId']}\t{op['x-phase']}\t{op['x-implementation-status']}\t{method.upper()} {path}")
        return
    if not args.operation_ids:
        parser.error('Specify operationIds or --list')
    print(yaml.safe_dump(extract(spec, args.operation_ids), allow_unicode=True, sort_keys=False))


if __name__ == '__main__':
    main()
