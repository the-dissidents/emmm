# Weixin HTTPS forward proxy

EMM uses a standard HTTPS proxy with HTTP CONNECT. The proxy's fixed public IP must be on the Weixin account's IP allowlist. Other compatible HTTPS CONNECT proxies work too; the editor does not require this deployment or a custom server API.

There are two TLS connections: EMM authenticates to the proxy over HTTPS, then creates an inner TLS connection to `api.weixin.qq.com` through the tunnel. Squid forwards encrypted bytes without TLS interception. The AppSecret, access token, article content and Weixin responses remain inside that inner connection. The proxy can see the destination, client IP, timing and traffic volume.

## Server setup

This template was validated with Alibaba Cloud Linux's maintained Squid 4 package. It uses Squid 4's `cert=` and `key=` HTTPS listener syntax. Check the equivalent certificate options when deploying a different Squid major version.

1. Install your distribution's Squid package with OpenSSL and the `basic_ncsa_auth` helper, plus Python 3.6–3.12, OpenSSL, systemd and logrotate.
2. Obtain a trusted TLS certificate for the proxy hostname. The certificate directory must contain `fullchain.pem` and `privkey.pem`. Keep its normal certificate renewal mechanism running.
3. Generate a random proxy password with at least 32 characters. Create a private, mode-0600 bootstrap JSON file containing `username` and `password`. Do not put it in Git or in command-line arguments.
4. Copy this directory and the private bootstrap file to the server, then run as root:

```sh
python3 install.py --certificate-dir /path/to/certificate \
  --credentials /private/path/bootstrap.json --port 8443
```

5. Allow the chosen TCP port in the host firewall and cloud security group. Leave the existing website and SSH configuration unchanged.
6. Add the server's actual public egress IP to the Weixin account's IP allowlist.

The installer creates an independent `emmm-proxy.service`, validates the generated configuration and starts it as the `squid` user. It stores a salted SHA-512 password hash, verifies that the authentication helper accepts it, then removes the bootstrap plaintext file. The client still needs its own copy of the proxy password.

Certificate files are copied to a private proxy directory without changing the original certificate permissions. An hourly timer copies renewed certificates and restarts only the proxy when they change. It does not issue or renew certificates itself. Re-running the installer updates the configuration and restarts the proxy; use a new bootstrap file to rotate the password.

## Access restrictions

- Authentication is mandatory for this deployment.
- Only CONNECT to the exact hostname `api.weixin.qq.com`, port 443, is allowed. Other domains, IP literals, ports and ordinary HTTP requests are rejected.
- No TLS interception, content cache or generic forwarding endpoint is enabled.
- Per-client concurrent connection limits, connection lifetimes, timeouts and service resource limits bound tunnel usage. They cannot count Weixin API requests inside the encrypted tunnel.
- Access logs contain client IP, destination, status and duration. They do not log proxy passwords, tokens or request bodies. Logs rotate daily and retain seven archives.

A password protects use of the tunnel. The Weixin AppSecret independently protects the account. Restricting the destination reduces abuse but cannot by itself prevent anonymous traffic from consuming the server's resources or making requests to Weixin.

## Editor configuration and verification

Choose **HTTPS proxy**, add a profile, enter `https://your-proxy-host:8443`, username and password, and save. A publicly trusted certificate needs no manual import. An optional private CA can be imported for a self-managed deployment; TLS verification is always enabled.

Proxy passwords and AppSecrets are saved as plain text in the editor's local `memorized.json`, alongside the other account and proxy settings. Both the proxy password and AppSecret are displayed directly in editable text fields; the application does not use the operating system credential store. Switching proxy profiles invalidates the in-memory token. A missing profile, rejected password or unavailable proxy produces an error; the editor does not fall back to direct access.

The proxy test connects through the tunnel to the real Weixin API and verifies its expected missing-token response. Then connect the actual account and test drafts and image uploads. Token acquisition, JSON requests, cover uploads and body image uploads all use the same native transport.

For a developer's end-to-end check, build `weixin_proxy_probe` from `apps/editor/src-tauri` and provide a private JSON file with `endpoint`, `username`, `password` and `certificate` (empty for a trusted certificate):

```sh
cargo run --example weixin_proxy_probe -- /private/path/proxy.json
```

The probe checks the real Weixin tunnel, both certificates, forbidden destinations, incorrect passwords and anonymous access. To additionally exercise an existing local account, append `--account <private-account-file> <test-png>`. The mode-0600 account JSON contains `appid` and `secret`; it reads the AppSecret from that private file, gets a stable token, reads drafts, uploads a cover and body image, and creates/updates/reads a temporary draft. It deletes only the draft and cover IDs created during that run. Weixin's body-image upload API does not provide a corresponding deletion operation.

Useful server diagnostics:

```sh
systemctl status emmm-proxy.service
systemctl status emmm-proxy-renew.timer
journalctl -u emmm-proxy.service --since today
```

Never use verbose client traces containing credentials or access-token URLs when collecting diagnostic logs.
