"""Release contract tests; no npm install or browser required."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).with_name('release.py')


class ReleaseTests(unittest.TestCase):
    def test_inlines_built_assets_and_creates_reproducible_source_archive(self):
        self.assertTrue(SCRIPT.is_file(), 'release implementation is missing')
        spec = importlib.util.spec_from_file_location('release', SCRIPT)
        release = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(release)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            files = {
                'dist/index.html': '<html><head><link rel="stylesheet" crossorigin href="./assets/app.css"></head><body><script type="module" crossorigin src="./assets/app.js"></script></body></html>',
                'dist/assets/app.js': 'console.log("offline </script> works");',
                'dist/assets/app.css': 'body{color:red}',
                'package.json': '{}', 'package-lock.json': '{}',
                'src/app.js': 'source', 'README.md': 'docs',
                'node_modules/secret': 'excluded', '.env': 'excluded',
                'test-results/log': 'excluded', 'releases/old.zip': 'excluded',
            }
            for name, value in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(value)
            release.package(root)
            html = (root / 'releases/sechenie-mvp.html').read_text()
            self.assertIn('body{color:red}', html)
            self.assertIn('console.log', html)
            self.assertNotIn('src="./assets/', html)
            self.assertIn('<\\/script>', html)
            archive = root / 'releases/sectionlab-source.zip'
            first = archive.read_bytes()
            with zipfile.ZipFile(archive) as z:
                self.assertIsNone(z.testzip())
                self.assertIn('releases/sechenie-mvp.html', z.namelist())
                self.assertIn('src/app.js', z.namelist())
                self.assertFalse(any('secret' in n or n.startswith('test-results') or n == '.env' for n in z.namelist()))
            release.package(root)
            self.assertEqual(first, archive.read_bytes())

    def test_rejects_unbundled_or_remote_resources(self):
        spec = importlib.util.spec_from_file_location('release', SCRIPT)
        release = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(release)
        for html in ('<img src="https://example.com/a.png">', '<link rel="modulepreload" href="./assets/chunk.js">'):
            with self.subTest(html=html), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                (root / 'dist').mkdir()
                (root / 'dist/index.html').write_text(html)
                with self.assertRaisesRegex(ValueError, 'resource'):
                    release.package(root)


if __name__ == '__main__':
    unittest.main()
