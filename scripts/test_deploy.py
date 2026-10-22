"""Deployment contracts; CLI/network boundaries are injected, never real AWS writes."""
import io
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
from unittest.mock import patch
import runpy
import unittest

MODULE = Path(__file__).with_name('deploy.py')
if MODULE.exists():
    spec = importlib.util.spec_from_file_location('sectionlab_deploy', MODULE)
    deploy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(deploy)
else:
    deploy = None


class DeployTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(deploy, 'deployment command is not implemented')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.calls = []
        (self.root / 'dist/assets').mkdir(parents=True)
        for name, content in {'index.html': b'<html>production</html>',
                              '404.html': b'not found',
                              'assets/index-Abcd1234.js': b'console.log(1)',
                              'assets/index-Abcd1234.css': b'body{}',
                              'assets/plain.js': b'not hashed',
                              'robots.txt': b'User-agent: *'}.items():
            (self.root / 'dist' / name).write_bytes(content)
        self.account = '775278852037'
        self.outputs = {'BucketName': 'sectionlab-production-test',
                        'DistributionId': 'E123456789ABCD',
                        'SiteUrl': 'https://d123456789abcd.cloudfront.net'}

    def run_cli(self, args, **kwargs):
        self.calls.append((args, kwargs))
        if 'get-caller-identity' in args:
            data = {'Account': self.account}
        elif 'describe-stacks' in args:
            data = {'Stacks': [{'Outputs': [{'OutputKey': k, 'OutputValue': v}
                                            for k, v in self.outputs.items()]}]}
        elif 'create-invalidation' in args:
            data = {'Invalidation': {'Id': 'I123456789ABCD'}}
        else:
            data = {}
        return subprocess.CompletedProcess(args, 0, stdout=json.dumps(data))

    def fetch(self, url, **kwargs):
        self.calls.append((['FETCH', url], kwargs))
        response = io.BytesIO((self.root / 'dist/index.html').read_bytes())
        response.status = 200
        response.geturl = lambda: url
        response.headers = {
            'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Strict-Transport-Security': 'max-age=31536000',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'",
        }
        return response

    def test_checks_run_in_order_foreground_before_release_and_stop_on_failure(self):
        def fail(args, **kwargs):
            self.run_cli(args, **kwargs)
            if args == ['npm', 'run', 'release']:
                raise subprocess.CalledProcessError(1, args)
            return subprocess.CompletedProcess(args, 0, stdout='{}')
        with self.assertRaises(subprocess.CalledProcessError):
            deploy.deploy(self.root, run=fail, env={})
        self.assertEqual([a for a, _ in self.calls], [
            ['npm', 'test'], ['npm', 'run', 'test:release'],
            ['npm', 'run', 'test:e2e'], ['npm', 'run', 'release'],
        ])
        for _, options in self.calls:
            self.assertEqual(options['cwd'], self.root)
            self.assertTrue(options['check'])
            self.assertGreater(options['timeout'], 0)
            self.assertNotIn('shell', options)
    def test_account_and_output_scope_are_validated_before_any_write(self):
        self.account = '000000000000'
        with self.assertRaisesRegex(ValueError, 'account'):
            deploy.deploy(self.root, run=self.run_cli, fetch=self.fetch, env={})
        self.assertFalse(any('describe-stacks' in a for a, _ in self.calls))
        self.account = '775278852037'
        invalid = {
            'BucketName': ['other-bucket', 'sectionlab-x/../../bad', '', 'sectionlab-X'],
            'DistributionId': ['../bad', '', 'E123;touch x'],
            'SiteUrl': ['http://d123.cloudfront.net', 'https://evil.com',
                        'https://d123.cloudfront.net.evil.com',
                        'https://user@d123.cloudfront.net',
                        'https://d123.cloudfront.net/path',
                        'https://d123.cloudfront.net?x=y'],
        }
        for key, values in invalid.items():
            original = self.outputs[key]
            for value in values:
                with self.subTest(key=key, value=value):
                    self.outputs[key] = value
                    self.calls.clear()
                    with self.assertRaises(ValueError):
                        deploy.deploy(self.root, run=self.run_cli, fetch=self.fetch, env={})
                    self.assertFalse(any('s3' in a or 'cloudfront' in a for a, _ in self.calls))
            del self.outputs[key]
            with self.assertRaises(ValueError):
                deploy.deploy(self.root, run=self.run_cli, fetch=self.fetch, env={})
            self.outputs[key] = original

    def test_scope_reads_use_fixed_stack_region_and_selected_profile(self):
        for env, profile in [({}, 'admin'), ({'AWS_PROFILE': 'custom'}, 'custom')]:
            self.calls.clear()
            deploy.deploy(self.root, run=self.run_cli, fetch=self.fetch, env=env)
            aws = [a for a, _ in self.calls if a[0] == 'aws']
            reads = [a for a in aws if 'get-caller-identity' in a or 'describe-stacks' in a]
            self.assertEqual(len(reads), 2)
            for command in aws:
                self.assertIn('eu-central-1', command)
                self.assertEqual(command[command.index('--profile') + 1], profile)
                self.assertIn('--no-cli-pager', command)
            self.assertIn('sectionlab-production', aws[1])
    def test_uploads_only_dist_assets_before_index_without_deletion(self):
        (self.root / 'secret.txt').write_text('not publishable')
        deploy.deploy(self.root, run=self.run_cli, fetch=self.fetch, env={})
        uploads = [a for a, _ in self.calls if 's3' in a]
        self.assertGreaterEqual(len(uploads), 6)
        self.assertFalse(any('--delete' in a for a in uploads))
        self.assertTrue(all('secret.txt' not in ' '.join(a) for a in uploads))
        self.assertEqual(uploads[-1][3], str(self.root / 'dist/index.html'))
        self.assertEqual(uploads[-1][4], 's3://sectionlab-production-test/index.html')
        for command in uploads:
            source = Path(command[3])
            self.assertTrue(source.is_relative_to(self.root / 'dist'))
            cache = command[command.index('--cache-control') + 1]
            mime = command[command.index('--content-type') + 1]
            if command[2] == 'sync':
                self.assertEqual(source, self.root / 'dist/assets')
                self.assertEqual(cache, 'public, max-age=31536000, immutable')
                self.assertIn('--exclude', command)
                self.assertIn('*', command)
                self.assertNotIn('plain.js', command)
                self.assertIn(mime, ('text/javascript', 'text/css'))
            else:
                self.assertEqual(cache, 'no-cache')
                self.assertNotIn('immutable', cache)
                if source.suffix == '.html':
                    self.assertEqual(mime, 'text/html; charset=utf-8')
        self.assertTrue(any(a[3].endswith('/assets/plain.js') for a in uploads))

    def test_missing_html_or_symlink_refuses_all_uploads(self):
        for name in ['index.html', '404.html']:
            path = self.root / 'dist' / name
            content = path.read_bytes()
            path.unlink()
            self.calls.clear()
            with self.assertRaises(ValueError):
                deploy.deploy(self.root, run=self.run_cli, fetch=self.fetch, env={})
            self.assertFalse(any('s3' in a for a, _ in self.calls))
            path.write_bytes(content)
        (self.root / 'dist/leak').symlink_to(self.root / 'secret.txt')
        with self.assertRaises(ValueError):
            deploy.deploy(self.root, run=self.run_cli, fetch=self.fetch, env={})
        self.assertFalse(any('s3' in a for a, _ in self.calls))
    def test_invalidation_waits_before_exact_bytes_and_security_verification(self):
        result = deploy.deploy(self.root, run=self.run_cli, fetch=self.fetch, env={})
        self.assertEqual(result, self.outputs['SiteUrl'])
        commands = [a for a, _ in self.calls]
        create = next(a for a in commands if 'create-invalidation' in a)
        self.assertEqual(create[create.index('--paths') + 1:create.index('--region')],
                         ['/', '/index.html', '/404.html'])
        self.assertIn(self.outputs['DistributionId'], create)
        wait = next(a for a in commands if 'invalidation-completed' in a)
        self.assertIn('I123456789ABCD', wait)
        self.assertIn(self.outputs['DistributionId'], wait)
        last_upload = max(i for i, a in enumerate(commands) if 's3' in a)
        self.assertLess(last_upload, commands.index(create))
        self.assertLess(commands.index(create), commands.index(wait))
        self.assertEqual(commands[-1], ['FETCH', self.outputs['SiteUrl'] + '/index.html'])
        self.assertLess(commands.index(wait), len(commands) - 1)
        self.assertGreater(self.calls[-1][1]['timeout'], 0)

    def test_remote_mismatch_or_missing_security_header_fails_closed(self):
        for mutation in ['bytes', 'status', 'redirect', 'Content-Security-Policy',
                         'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy',
                         'Strict-Transport-Security', 'Permissions-Policy',
                         'Cache-Control', 'Content-Type', 'weak-csp']:
            def bad_fetch(url, **kwargs):
                response = self.fetch(url, **kwargs)
                if mutation == 'bytes':
                    response.seek(0)
                    response.write(b'WRONG')
                    response.seek(0)
                elif mutation == 'status':
                    response.status = 404
                elif mutation == 'redirect':
                    response.geturl = lambda: 'https://evil.example/'
                elif mutation == 'weak-csp':
                    response.headers['Content-Security-Policy'] = "default-src *"
                else:
                    del response.headers[mutation]
                return response
            with self.subTest(mutation=mutation):
                with self.assertRaises(ValueError):
                    deploy.deploy(self.root, run=self.run_cli, fetch=bad_fetch, env={})
    def test_npm_deploy_wires_executable_script_and_cli_stops_at_failed_gate(self):
        package = json.loads((MODULE.parents[1] / 'package.json').read_text())
        self.assertEqual(package['scripts'].get('deploy'), 'python3 scripts/deploy.py')
        with patch('subprocess.run', side_effect=subprocess.CalledProcessError(1, ['npm', 'test'])), \
                patch('sys.stdout', new_callable=io.StringIO) as stdout:
            with self.assertRaises(SystemExit) as stopped:
                runpy.run_path(str(MODULE), run_name='__main__')
            self.assertEqual(stopped.exception.code, 1)
            self.assertIn('Deployment failed', stdout.getvalue())

    def test_external_failures_stop_before_next_stage(self):
        for failure in ['test:release', 'test:e2e', 'release', 'get-caller-identity',
                        'describe-stacks', 'sync', 'cp', 'create-invalidation',
                        'invalidation-completed']:
            self.calls.clear()
            def fail(args, **kwargs):
                result = self.run_cli(args, **kwargs)
                if failure in args:
                    raise subprocess.CalledProcessError(1, args)
                return result
            with self.subTest(failure=failure):
                with self.assertRaises(subprocess.CalledProcessError):
                    deploy.deploy(self.root, run=fail, fetch=self.fetch, env={})
                self.assertIn(failure, self.calls[-1][0])
                self.assertFalse(any(a[0] == 'FETCH' for a, _ in self.calls))


if __name__ == '__main__':
    unittest.main()
