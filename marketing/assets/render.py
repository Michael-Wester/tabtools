#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Render preserved final artwork; never uploads or changes store listings."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='Output directory, preferably outside the repository')
    parser.add_argument('locales', nargs='*', help='Registry locale(s) and/or global; defaults to all 30')
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    by_locale = {item['locale']: item for item in manifest['sources']}
    locales = list(dict.fromkeys(args.locales)) or list(by_locale)
    unknown = set(locales) - set(by_locale)
    if unknown:
        parser.error('Unknown source locale(s): ' + ', '.join(sorted(unknown)))
    for command in ('node', 'pdftoppm', 'fc-match'):
        if not shutil.which(command):
            parser.error(f'Required executable not found: {command}')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault('XDG_CACHE_HOME', str(output / '.cache'))
    # These final sources intentionally depend on installed Noto faces for scripts
    # not covered by the embedded Inter fonts. Stop instead of silently substituting.
    families = {'he': 'Noto Sans Hebrew', 'ja': 'Noto Sans CJK JP',
                'ko': 'Noto Sans CJK KR', 'zh-CN': 'Noto Sans CJK SC',
                'zh-TW': 'Noto Sans CJK TC'}
    for locale in locales:
        if locale in families:
            for style in ('Regular', 'Bold'):
                wanted = families[locale]
                matched = subprocess.check_output(
                    ['fc-match', '--format=%{family}', f'{wanted}:style={style}'], text=True)
                if wanted not in matched.split(','):
                    parser.error(f'Missing font: {wanted} {style}; got {matched}')
    try:
        import weasyprint
    except ImportError:
        parser.error('Install Python dependencies from marketing/assets/requirements-render.txt')
    subprocess.run(['node', str(ROOT / 'materialize.js'), 'materialize', str(output), *locales],
                   check=True, stdout=subprocess.DEVNULL)
    report = {'weasyprint': weasyprint.__version__, 'python': sys.version.split()[0],
              'poppler': subprocess.run(['pdftoppm', '-v'], capture_output=True, text=True,
                                        check=True).stderr.splitlines()[0],
              'note': 'PNG hashes are comparisons, not a promise of identical rendering across platforms. Global approved exports used a footer-only composite.',
              'sources': []}
    for locale in locales:
        folder = output / locale
        document = weasyprint.HTML(filename=str(folder / 'TabTools.html')).render()
        if len(document.pages) != 5:
            raise ValueError(f'{locale}: expected 5 pages, got {len(document.pages)}')
        pdf = folder / 'TabTools.pdf'
        document.write_pdf(str(pdf))
        files = []
        for slide in by_locale[locale]['slides']:
            page = str(slide['order'])
            png = folder / f'screenshot-{page}.png'
            subprocess.run(['pdftoppm', '-f', page, '-l', page, '-singlefile',
                            '-scale-to-x', '1280', '-scale-to-y', '800', '-png',
                            str(pdf), str(png.with_suffix(''))], check=True)
            data = png.read_bytes()
            if data[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>IIBB', data[16:26]) != (1280, 800, 8, 2):
                raise ValueError(f'{png}: expected opaque 1280x800 RGB PNG')
            digest = hashlib.sha256(data).hexdigest()
            files.append({'order': slide['order'], 'path': str(png.relative_to(output)),
                          'sha256': digest,
                          'matchesApprovedExport': digest == slide['approvedExport']['sha256']})
        report['sources'].append({'locale': locale, 'pages': 5, 'files': files})
        print(f'{locale}: rendered 5 images; {sum(row["matchesApprovedExport"] for row in files)}/5 approved-export hashes match', flush=True)
    (output / 'render-report.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
