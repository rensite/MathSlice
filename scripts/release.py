"""Package an already-built, single-bundle Vite app. Python standard library only."""
from pathlib import Path
import hashlib
import re
import zipfile
from html.parser import HTMLParser


class ResourceValidator(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('src', 'href', 'srcset') and value and not value.startswith(('data:', '#')):
                raise ValueError(f'Unbundled resource in standalone HTML: {value}')


def package(root):
    root = Path(root)
    dist = root / 'dist'
    html = (dist / 'index.html').read_text(encoding='utf-8')

    def inline_script(match):
        source = (dist / match[1].lstrip('./')).read_text(encoding='utf-8')
        return '<script type="module">' + re.sub(r'</script', r'<\\/script', source, flags=re.I) + '</script>'

    def inline_style(match):
        source = (dist / match[1].lstrip('./')).read_text(encoding='utf-8')
        return '<style>' + source + '</style>'

    html = re.sub(r'<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*</script>', inline_script, html)
    html = re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>', inline_style, html)
    ResourceValidator().feed(html)
    output = root / 'releases'
    output.mkdir(exist_ok=True)
    standalone = output / 'sechenie-mvp.html'
    standalone.write_text(html, encoding='utf-8')
    entries = []
    # Explicit allowlist: never ship credentials, caches, dependencies or old archives.
    for name in ('src', 'tests', 'e2e', 'scripts', 'public', 'deploy', '.github', 'dist'):
        entries.extend(p for p in (root / name).rglob('*') if p.is_file() and not p.is_symlink() and '__pycache__' not in p.parts)
    for name in ('package.json', 'package-lock.json', 'index.html', 'playwright.config.js', 'README.md', 'VERIFICATION.md', 'Dockerfile', '.dockerignore', '.gitignore'):
        if (root / name).is_file():
            entries.append(root / name)
    entries.append(standalone)
    archive = output / 'sectionlab-source.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in sorted(set(entries)):
            info = zipfile.ZipInfo(path.relative_to(root).as_posix(), date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, path.read_bytes(), compresslevel=9)
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() is not None:
            raise RuntimeError('ZIP integrity check failed')
    sums = ''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n' for path in (standalone, archive))
    (output / 'SHA256SUMS').write_text(sums, encoding='ascii')
    print(f'Packaged {len(set(entries))} files; verified ZIP integrity.\n{sums}', end='')


if __name__ == '__main__':
    package(Path(__file__).resolve().parents[1])
