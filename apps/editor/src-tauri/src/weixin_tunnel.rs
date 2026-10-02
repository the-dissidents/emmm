use std::{
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream},
    process::{Child, Command, Stdio},
    path::{Path, PathBuf},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshServer {
    host: String,
    username: String,
    ssh_port: u16,
    identity_file: String,
    host_keys: Vec<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerFingerprint {
    host_keys: Vec<String>,
    fingerprints: String,
}

#[derive(Default)]
pub struct WeixinTunnelState(Mutex<Option<SshTunnel>>);

struct SshTunnel {
    server: SshServer,
    port: u16,
    child: Child,
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl WeixinTunnelState {
    pub fn stop(&self) {
        if let Ok(mut tunnel) = self.0.lock() {
            *tunnel = None;
        }
    }

    fn ensure(&self, server: SshServer, port: u16, directory: &Path) -> Result<(), String> {
        validate_server(&server, port)?;
        let mut current = self.0.lock().map_err(|_| "Tunnel state is unavailable")?;
        if let Some(tunnel) = current.as_mut() {
            if tunnel.server == server && tunnel.port == port
                && matches!(tunnel.child.try_wait(), Ok(None)) && socks_ready(port)
            {
                return Ok(());
            }
        }
        // Only the SSH child created by this application is ever stopped.
        *current = None;
        let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
        let listener = TcpListener::bind(address)
            .map_err(|_| format!("Local port {port} is already in use. Choose a different port."))?;
        drop(listener);

        std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;
        let config_file = directory.join("weixin-ssh-config");
        let known_hosts = directory.join("weixin-known-hosts");
        std::fs::write(&config_file, "").map_err(|error| error.to_string())?;
        std::fs::write(&known_hosts, server.host_keys.join("\n") + "\n")
            .map_err(|error| error.to_string())?;
        let known_hosts_option = format!("UserKnownHostsFile=\"{}\"",
            known_hosts.to_string_lossy().replace('\\', "\\\\").replace('\"', "\\\""));
        let child = Command::new("ssh")
            .arg("-F").arg(config_file)
            .arg("-p").arg(server.ssh_port.to_string())
            .arg("-l").arg(&server.username)
            .arg("-i").arg(&server.identity_file)
            .args(["-o", "IdentitiesOnly=yes", "-o", "GlobalKnownHostsFile=none"])
            .arg("-o").arg(known_hosts_option)
            .args(["-N", "-T", "-D", &format!("127.0.0.1:{port}")])
            .args(["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"])
            .args(["-o", "StrictHostKeyChecking=yes", "-o", "ExitOnForwardFailure=yes"])
            .args(["-o", "ControlMaster=no", "-o", "ControlPath=none", "-o", "LogLevel=ERROR"])
            .args(["-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3"])
            .arg(&server.host)
            .env("SSH_ASKPASS_REQUIRE", "never")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Cannot start SSH: {error}"))?;
        let mut tunnel = SshTunnel { server, port, child };
        let deadline = Instant::now() + Duration::from_secs(12);
        while Instant::now() < deadline {
            match tunnel.child.try_wait() {
                Ok(Some(_)) => {
                    let mut message = String::new();
                    if let Some(mut stderr) = tunnel.child.stderr.take() {
                        let _ = stderr.read_to_string(&mut message);
                    }
                    return Err(format!("SSH connection failed: {}", message.trim()));
                }
                Ok(None) => {}
                Err(error) => return Err(format!("Cannot check SSH connection: {error}")),
            }
            if socks_ready(port) {
                *current = Some(tunnel);
                return Ok(());
            }
            thread::sleep(Duration::from_millis(100));
        }
        Err("SSH connection timed out. Check the server and SSH key configuration.".into())
    }
}

fn validate_host(host: &str) -> Result<(), String> {
    if host.is_empty() || host.starts_with('-') || host.len() > 255
        || !host.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._-:".contains(&byte))
    {
        return Err("Invalid server address".into());
    }
    Ok(())
}

fn validate_server(server: &SshServer, port: u16) -> Result<(), String> {
    validate_host(&server.host)?;
    if server.ssh_port == 0 || server.username.is_empty() || server.username.starts_with('-')
        || !server.username.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    {
        return Err("Invalid SSH port or username".into());
    }
    if port < 1024 {
        return Err("Local forwarding port must be between 1024 and 65535".into());
    }
    if !Path::new(&server.identity_file).is_file() {
        return Err("Private key file does not exist".into());
    }
    if server.host_keys.is_empty() {
        return Err("Server fingerprint is not trusted".into());
    }
    let endpoint = if server.ssh_port == 22 { server.host.clone() }
        else { format!("[{}]:{}", server.host, server.ssh_port) };
    for key in &server.host_keys {
        let fields: Vec<_> = key.split_whitespace().collect();
        if fields.len() != 3 || fields[0] != endpoint || key.contains('\n') {
            return Err("Server fingerprint does not match its address".into());
        }
    }
    Ok(())
}

fn socks_ready(port: u16) -> bool {
    let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port).into();
    let Ok(mut connection) = TcpStream::connect_timeout(&address, Duration::from_millis(200)) else {
        return false;
    };
    let timeout = Some(Duration::from_millis(300));
    let _ = connection.set_read_timeout(timeout);
    let _ = connection.set_write_timeout(timeout);
    let mut response = [0; 2];
    connection.write_all(&[5, 1, 0]).is_ok()
        && connection.read_exact(&mut response).is_ok() && response == [5, 0]
}

#[tauri::command]
pub async fn ensure_weixin_tunnel(
    app: tauri::AppHandle,
    server: SshServer,
    port: u16,
) -> Result<(), String> {
    // Validate before dispatch; connection setup must not block the UI thread.
    validate_server(&server, port)?;
    use tauri::Manager;
    let directory = app.path().app_config_dir().map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        app.state::<WeixinTunnelState>().ensure(server, port, &directory)
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn probe_weixin_server(app: tauri::AppHandle, host: String, ssh_port: u16)
    -> Result<ServerFingerprint, String>
{
    validate_host(&host)?;
    if ssh_port == 0 { return Err("Invalid SSH port".into()); }
    use tauri::Manager;
    let directory: PathBuf = app.path().app_config_dir().map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let scan = Command::new("ssh-keyscan")
            .args(["-T", "5", "-t", "ed25519,ecdsa,rsa", "-p", &ssh_port.to_string()])
            .arg(&host).stdin(Stdio::null()).output().map_err(|error| error.to_string())?;
        let host_keys: Vec<String> = String::from_utf8_lossy(&scan.stdout).lines()
            .filter(|line| !line.starts_with('#') && !line.trim().is_empty())
            .map(str::to_string).collect();
        if host_keys.is_empty() { return Err("Cannot read server fingerprint".into()); }
        std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let scan_file = directory.join("weixin-keyscan");
        std::fs::write(&scan_file, host_keys.join("\n")).map_err(|error| error.to_string())?;
        let fingerprint = Command::new("ssh-keygen").arg("-lf").arg(&scan_file)
            .stdin(Stdio::null()).output().map_err(|error| error.to_string())?;
        let _ = std::fs::remove_file(scan_file);
        if !fingerprint.status.success() { return Err("Invalid server fingerprint".into()); }
        Ok(ServerFingerprint { host_keys, fingerprints: String::from_utf8_lossy(&fingerprint.stdout).trim().into() })
    }).await.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_server_addresses_without_accepting_options_or_shell_input() {
        for host in ["47.100.96.250", "server.example.com", "2001:db8::1"] {
            assert!(validate_host(host).is_ok());
        }
        for host in ["", "-oProxyCommand=evil", "host;touch /tmp/file", "host name", "host\nname", "user@host"] {
            assert!(validate_host(host).is_err());
        }
    }

    #[test]
    fn verifies_socks_handshake_instead_of_accepting_any_listening_port() {
        for reply in [[5, 0], [5, 255], [0, 0]] {
            let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
            let port = listener.local_addr().unwrap().port();
            let server = thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut greeting = [0; 3];
                stream.read_exact(&mut greeting).unwrap();
                assert_eq!(greeting, [5, 1, 0]);
                stream.write_all(&reply).unwrap();
            });
            assert_eq!(socks_ready(port), reply == [5, 0]);
            server.join().unwrap();
        }
    }

    #[test]
    #[ignore = "requires an SSH server configured on this computer"]
    fn connects_reuses_and_closes_a_configured_ssh_tunnel() {
        let server: SshServer = serde_json::from_str(&std::env::var("EMMM_TEST_SSH_SERVER")
            .expect("Set EMMM_TEST_SSH_SERVER to a JSON server profile")).unwrap();
        let directory = std::env::temp_dir().join(format!("emmm-ssh-test-{}", std::process::id()));
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let state = WeixinTunnelState::default();
        state.ensure(server.clone(), port, &directory).unwrap();
        let original_pid = state.0.lock().unwrap().as_ref().unwrap().child.id();
        assert!(socks_ready(port));
        state.ensure(server, port, &directory).unwrap();
        assert_eq!(original_pid, state.0.lock().unwrap().as_ref().unwrap().child.id());
        state.stop();
        assert!(!socks_ready(port));
        std::fs::remove_dir_all(directory).unwrap();
    }
}
