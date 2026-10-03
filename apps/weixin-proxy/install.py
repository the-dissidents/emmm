#!/usr/bin/env python3
"""Install the Squid configuration on a Linux server; bootstrap secrets stay off Git."""
import argparse
import crypt
import grp
import json
import os
import pwd
from pathlib import Path
import shlex
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--certificate-dir', required=True)
parser.add_argument('--credentials', required=True)
parser.add_argument('--port', type=int, default=8443)
args = parser.parse_args()
if os.geteuid() != 0 or not 1024 <= args.port <= 65535:
    parser.error('Run as root and select a port between 1024 and 65535.')

source = Path(__file__).resolve().parent
certificate = Path(args.certificate_dir).resolve()
secret_file = Path(args.credentials)
credentials = json.loads(secret_file.read_text())
username, password = credentials['username'], credentials['password']
if not username or ':' in username or any(c.isspace() for c in username) or len(password) < 32:
    parser.error('Use a valid username and a randomly generated password of at least 32 characters.')

helper = next((p for p in ['/usr/lib64/squid/basic_ncsa_auth', '/usr/lib/squid/basic_ncsa_auth'] if Path(p).exists()), None)
if helper is None:
    parser.error('Install the distribution Squid package with NCSA authentication first.')

config = Path('/etc/emmm-proxy')
config.mkdir(mode=0o750, exist_ok=True)
squid_group = grp.getgrnam('squid').gr_gid
os.chown(str(config), 0, squid_group)
os.chmod(str(config), 0o750)

def write(path, content, mode=0o640, group=squid_group):
    path.write_text(content)
    os.chmod(str(path), mode)
    os.chown(str(path), 0, group)

password_hash = crypt.crypt(password, crypt.mksalt(crypt.METHOD_SHA512))
if not password_hash or password_hash.startswith('*'):
    raise RuntimeError('SHA-512 password hashing is unavailable on this server.')
write(config / 'passwords', username + ':' + password_hash + '\n')
check = subprocess.run([helper, str(config / 'passwords')], input=username + ' ' + password + '\n', universal_newlines=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
if not check.stdout.startswith('OK'):
    raise RuntimeError('Squid could not verify the generated password hash.')
secret_file.unlink()

for name in ['fullchain.pem', 'privkey.pem']:
    shutil.copyfile(str(certificate / name), str(config / name))
    os.chmod(str(config / name), 0o640)
    os.chown(str(config / name), 0, squid_group)
write(config / 'squid.conf', (source / 'squid.conf').read_text().replace('@PORT@', str(args.port)).replace('@AUTH_HELPER@', helper))
write(Path('/etc/systemd/system/emmm-proxy.service'), (source / 'emmm-proxy.service').read_text(), 0o644, 0)

renew = '''#!/bin/sh
set -eu
source_dir={source_dir}
target_dir=/etc/emmm-proxy
if cmp -s "$source_dir/fullchain.pem" "$target_dir/fullchain.pem" && cmp -s "$source_dir/privkey.pem" "$target_dir/privkey.pem"; then exit 0; fi
cert_key=$(openssl x509 -in "$source_dir/fullchain.pem" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum)
private_key=$(openssl pkey -in "$source_dir/privkey.pem" -pubout -outform DER | sha256sum)
[ "$cert_key" = "$private_key" ]
openssl x509 -in "$source_dir/fullchain.pem" -checkend 3600 -noout
for name in fullchain.pem privkey.pem; do
    install -o root -g squid -m 640 "$source_dir/$name" "$target_dir/$name.new"
    mv "$target_dir/$name.new" "$target_dir/$name"
done
systemctl try-restart emmm-proxy.service
'''.format(source_dir=shlex.quote(str(certificate)))
write(Path('/usr/local/sbin/emmm-proxy-renew'), renew, 0o700, 0)
write(Path('/etc/systemd/system/emmm-proxy-renew.service'), '''[Unit]
Description=Copy renewed website certificate to the Weixin proxy
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/emmm-proxy-renew
''', 0o644, 0)
write(Path('/etc/systemd/system/emmm-proxy-renew.timer'), '''[Unit]
Description=Keep the Weixin proxy TLS certificate current
[Timer]
OnBootSec=5min
OnUnitActiveSec=1h
Persistent=true
[Install]
WantedBy=timers.target
''', 0o644, 0)
write(Path('/etc/logrotate.d/emmm-proxy'), '''/var/log/emmm-proxy/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    copytruncate
    su squid squid
}
''', 0o644, 0)

for directory in ['/run/emmm-proxy', '/var/log/emmm-proxy']:
    Path(directory).mkdir(mode=0o750, exist_ok=True)
    os.chown(directory, pwd.getpwnam('squid').pw_uid, squid_group)
subprocess.run(['/usr/sbin/squid', '-k', 'parse', '-f', str(config / 'squid.conf')], check=True)
subprocess.run(['systemctl', 'daemon-reload'], check=True)
subprocess.run(['systemctl', 'enable', '--now', 'emmm-proxy.service', 'emmm-proxy-renew.timer'], check=True)
subprocess.run(['systemctl', 'restart', 'emmm-proxy.service'], check=True)
subprocess.run(['systemctl', 'is-active', 'emmm-proxy.service'], check=True)
print('HTTPS CONNECT proxy installed; bootstrap password removed. Port: ' + str(args.port))
