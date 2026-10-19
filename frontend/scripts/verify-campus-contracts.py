"""Validate preview wire envelopes against the unchanged canonical contract.

Run campus-demo.test.ts first, then invoke with the repository contract venv.
"""
import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker

frontend = Path(__file__).resolve().parents[1]
contract = yaml.safe_load((frontend.parent / 'docs/openapi.yaml').read_text(encoding='utf-8'))
samples = json.loads((frontend / '.cache/student-v33/contract-samples.json').read_text(encoding='utf-8'))
for sample in samples:
    schema = {'$ref': '#/components/schemas/Response_' + sample['operationId'], 'components': contract['components']}
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = list(validator.iter_errors(sample['envelope']))
    if errors:
        raise AssertionError(sample['operationId'] + ': ' + '; '.join(str(list(e.absolute_path)) + ' ' + str(e.validator) + '=' + str(e.validator_value) for e in errors))
print(f'PASS: {len(samples)} preview response envelopes conform to OpenAPI; no contract changes.')
