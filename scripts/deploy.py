"""Publish the production build using the AWS CLI; no third-party Python modules."""
from pathlib import Path
import json
import mimetypes
import os
import re
import subprocess
from urllib.request import urlopen


def deploy(root, *, run=subprocess.run, fetch=urlopen, env=None):
    root = Path(root)
    for command in (['npm', 'test'], ['npm', 'run', 'test:release'],
                    ['npm', 'run', 'test:e2e'], ['npm', 'run', 'release']):
        run(command, cwd=root, check=True, timeout=900)

    env = os.environ if env is None else env
    profile = env.get('AWS_PROFILE') or 'admin'

    def aws(*args, json_output=True):
        result = run(['aws', *args, '--region', 'eu-central-1', '--profile', profile,
                      '--no-cli-pager', '--output', 'json'], cwd=root, check=True,
                     timeout=900, capture_output=True, text=True)
        return json.loads(result.stdout) if json_output else None

    identity = aws('sts', 'get-caller-identity')
    if identity.get('Account') != '775278852037':
        raise ValueError('Refusing deployment outside AWS account 775278852037')
    stacks = aws('cloudformation', 'describe-stacks', '--stack-name', 'sectionlab-production')
    try:
        entries = stacks['Stacks']
        if len(entries) != 1:
            raise ValueError('Expected exactly one production stack')
        outputs = {item['OutputKey']: item['OutputValue'] for item in entries[0]['Outputs']}
        bucket, distribution, url = (outputs[k] for k in ('BucketName', 'DistributionId', 'SiteUrl'))
    except (KeyError, TypeError) as exc:
        raise ValueError('Missing production stack outputs') from exc
    if not re.fullmatch(r'sectionlab-[a-z0-9][a-z0-9-]{0,51}[a-z0-9]', bucket):
        raise ValueError('Unsafe production bucket name')
    if not re.fullmatch(r'E[A-Z0-9]{5,31}', distribution):
        raise ValueError('Unsafe CloudFront distribution ID')
    if not re.fullmatch(r'https://d[a-z0-9]+\.cloudfront\.net/?', url):
        raise ValueError('SiteUrl must be an HTTPS CloudFront origin without path or credentials')

    dist = root / 'dist'
    paths = sorted(dist.rglob('*'))
    if dist.is_symlink() or any(path.is_symlink() for path in paths):
        raise ValueError('Refusing symlinks in production dist')
    if not all((dist / name).is_file() for name in ('index.html', '404.html')):
        raise ValueError('Production dist requires index.html and 404.html')
    files = [path for path in paths if path.is_file()]
    hashed = [path for path in files if re.fullmatch(
        r'assets/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(?:js|css)',
        path.relative_to(dist).as_posix())]
    for extension, mime in (('.js', 'text/javascript'), ('.css', 'text/css')):
        group = [path for path in hashed if path.suffix == extension]
        if group:
            filters = ['--exclude', '*']
            for path in group:
                filters.extend(['--include', path.relative_to(dist / 'assets').as_posix()])
            aws('s3', 'sync', str(dist / 'assets'), f's3://{bucket}/assets',
                *filters, '--cache-control', 'public, max-age=31536000, immutable',
                '--content-type', mime, '--only-show-errors', '--no-follow-symlinks',
                json_output=False)
    # HTML entry point is deliberately last, after all referenced assets and 404.
    remaining = sorted((p for p in files if p not in hashed),
                       key=lambda p: (p == dist / 'index.html', p.as_posix()))
    for path in remaining:
        mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
                '.css': 'text/css'}.get(path.suffix) or mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        aws('s3', 'cp', str(path), f's3://{bucket}/{path.relative_to(dist).as_posix()}',
            '--cache-control', 'no-cache', '--content-type', mime,
            '--only-show-errors', '--no-follow-symlinks', json_output=False)

    invalidation = aws('cloudfront', 'create-invalidation', '--distribution-id', distribution,
                       '--paths', '/', '/index.html', '/404.html')
    invalidation_id = invalidation.get('Invalidation', {}).get('Id', '')
    if not re.fullmatch(r'[A-Z0-9]{5,64}', invalidation_id):
        raise ValueError('Missing or unsafe invalidation ID')
    aws('cloudfront', 'wait', 'invalidation-completed', '--distribution-id', distribution,
        '--id', invalidation_id, json_output=False)
    target = url.rstrip('/') + '/index.html'
    expected = (dist / 'index.html').read_bytes()
    with fetch(target, timeout=60) as response:
        if response.status != 200 or response.geturl() != target:
            raise ValueError('Production verification returned an error or redirect')
        if response.read(len(expected) + 1) != expected:
            raise ValueError('Production index.html bytes differ from local dist')
        headers = {key.lower(): value.strip() for key, value in response.headers.items()}
    required_headers = {
        'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'strict-transport-security': 'max-age=31536000',
        'permissions-policy': 'camera=(), microphone=(), geolocation=()',
        'cache-control': 'no-cache',
    }
    for name, value in required_headers.items():
        if headers.get(name) != value:
            raise ValueError(f'Production header mismatch: {name}')
    if headers.get('content-type', '').split(';')[0].strip() != 'text/html':
        raise ValueError('Production content type is not HTML')
    expected_csp = {
        'default-src': {"'self'"}, 'script-src': {"'self'"},
        'style-src': {"'self'", "'unsafe-inline'"},
        'img-src': {"'self'", 'data:', 'blob:'}, 'font-src': {"'self'"},
        'connect-src': {"'self'"}, 'object-src': {"'none'"},
        'base-uri': {"'self'"}, 'frame-ancestors': {"'none'"}, 'form-action': {"'none'"},
    }
    csp = {}
    for directive in headers.get('content-security-policy', '').split(';'):
        parts = directive.split()
        if parts:
            if parts[0] in csp:
                raise ValueError('Duplicate production CSP directive')
            csp[parts[0]] = set(parts[1:])
    if any(csp.get(name) != values for name, values in expected_csp.items()):
        raise ValueError('Production Content-Security-Policy mismatch')
    print(f'Verified production deployment: {url.rstrip("/")}')
    return url.rstrip('/')


if __name__ == '__main__':
    try:
        deploy(Path(__file__).resolve().parents[1])
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # CLI output may contain credentials; never dump stdout/stderr or env.
        print(f'Deployment failed ({type(error).__name__}): {error}')
        raise SystemExit(1)
