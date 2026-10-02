//! Optional history-link reader. Uses an isolated browser profile and never bypasses Weixin verification.
use std::{path::{Path, PathBuf}, process::{Child, Command, Stdio}, time::Duration};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tauri::Manager;
use tauri_plugin_http::reqwest::{self, Url};
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[derive(Default)]
pub struct HistoryBrowserState(tokio::sync::Mutex<()>);
struct OwnedBrowser(Child, PathBuf);
impl Drop for OwnedBrowser {
    fn drop(&mut self) { let _ = self.0.kill(); let _ = self.0.wait(); let _ = std::fs::remove_dir_all(&self.1); }
}
fn valid_article(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "文章链接无效")?;
    if url.scheme() != "https" || url.host_str() != Some("mp.weixin.qq.com")
        || !url.username().is_empty() || url.password().is_some()
        || url.port().is_some_and(|port| port != 443)
        || !(url.path() == "/s" || url.path().starts_with("/s/")) {
        return Err("请输入微信公众号文章链接".into());
    }
    Ok(url)
}
fn browser_path() -> Option<PathBuf> {
    let mut paths = Vec::new();
    #[cfg(target_os = "macos")]
    for name in ["Google Chrome", "Microsoft Edge", "Brave Browser", "Chromium"] {
        paths.push(PathBuf::from(format!("/Applications/{name}.app/Contents/MacOS/{name}")));
    }
    #[cfg(target_os = "windows")]
    for root in ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
        if let Some(root) = std::env::var_os(root) {
            for name in ["Google/Chrome/Application/chrome.exe", "Microsoft/Edge/Application/msedge.exe", "BraveSoftware/Brave-Browser/Application/brave.exe"] {
                paths.push(PathBuf::from(&root).join(name));
            }
        }
    }
    #[cfg(target_os = "linux")]
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            for name in ["google-chrome", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"] { paths.push(dir.join(name)); }
        }
    }
    paths.into_iter().find(|path| path.is_file())
}
async fn browser_html(url: Url, root: &Path, visible: bool) -> Result<String, String> {
    let executable = browser_path().ok_or("链接读取需要 Chrome、Edge 或 Chromium")?;
    let id = format!("history-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());
    let profile = root.join(id);
    std::fs::create_dir_all(&profile).map_err(|error| error.to_string())?;
    let mut command = Command::new(executable);
    command.arg(format!("--user-data-dir={}", profile.display()))
        .args(["--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check"]);
    if visible { command.arg("--new-window"); }
    else { command.args(["--headless=new", "--disable-gpu"]); }
    let child = command.arg(url.as_str()).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn().map_err(|error| error.to_string())?;
    let mut owned = OwnedBrowser(child, profile.clone());
    let client = reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(5)).build().map_err(|error| error.to_string())?;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(if visible { 180 } else { 30 });
    let debug_port = loop {
        if owned.0.try_wait().map_err(|e| e.to_string())?.is_some() { return Err("浏览器已关闭".into()); }
        if let Ok(text) = std::fs::read_to_string(profile.join("DevToolsActivePort")) {
            if let Some(port) = text.lines().next().and_then(|line| line.parse::<u16>().ok()) { break port; }
        }
        if tokio::time::Instant::now() >= deadline { return Err("浏览器启动超时".into()); }
        tokio::time::sleep(Duration::from_millis(250)).await;
    };
    let target = loop {
        if let Ok(response) = client.get(format!("http://127.0.0.1:{debug_port}/json/list")).send().await {
            if let Ok(body) = response.text().await {
                let pages: Vec<Value> = serde_json::from_str(&body).map_err(|e| e.to_string())?;
                if let Some(page) = pages.into_iter().find(|page| page["type"] == "page") { break page; }
            }
        }
        if tokio::time::Instant::now() >= deadline { return Err("读取文章超时".into()); }
        tokio::time::sleep(Duration::from_millis(250)).await;
    };
    let ws_url = target["webSocketDebuggerUrl"].as_str().ok_or("浏览器连接失败")?;
    let ws = Url::parse(ws_url).map_err(|e| e.to_string())?;
    if ws.host_str() != Some("127.0.0.1") || ws.port() != Some(debug_port) || ws.scheme() != "ws" { return Err("浏览器连接地址异常".into()); }
    let (mut socket, _) = connect_async(ws_url).await.map_err(|e| e.to_string())?;
    let expression = r#"JSON.stringify({href:location.href,html:document.querySelector('#js_content, .rich_media_content')?document.documentElement.outerHTML:''})"#;
    let mut id = 0;
    while tokio::time::Instant::now() < deadline {
        id += 1;
        socket.send(Message::Text(json!({"id":id,"method":"Runtime.evaluate","params":{"expression":expression,"returnByValue":true}}).to_string().into())).await.map_err(|e| e.to_string())?;
        let response = tokio::time::timeout(Duration::from_secs(10), async {
            while let Some(message) = socket.next().await {
                let message = message.map_err(|e| e.to_string())?;
                if let Message::Text(text) = message {
                    let value: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
                    if value["id"] == id { return Ok(value); }
                }
            }
            Err("浏览器已关闭".to_string())
        }).await.map_err(|_| "浏览器读取超时")??;
        if let Some(value) = response["result"]["result"]["value"].as_str() {
            let page: Value = serde_json::from_str(value).map_err(|e| e.to_string())?;
            let href = page["href"].as_str().unwrap_or_default();
            // A newly created browser tab starts blank before the requested article loads.
            if href == "about:blank" || href == "chrome://newtab/" {
                tokio::time::sleep(Duration::from_millis(250)).await;
                continue;
            }
            let location = Url::parse(href).map_err(|_| "文章地址无效")?;
            if location.host_str() != Some("mp.weixin.qq.com") { return Err("文章跳转到了其他网站".into()); }
            let html = page["html"].as_str().unwrap_or_default();
            if !html.is_empty() {
                if html.len() > 10 * 1024 * 1024 { return Err("文章内容过大".into()); }
                return Ok(html.to_string());
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Err(if visible { "微信验证未完成，请重新生成" } else { "微信验证或访问限制阻止了读取" }.into())
}

#[tauri::command]
pub async fn read_weixin_history_article(app: tauri::AppHandle, state: tauri::State<'_, HistoryBrowserState>, url: String, visible: Option<bool>) -> Result<String, String> {
    let url = valid_article(&url)?;
    let _lock = state.0.try_lock().map_err(|_| "已有文章正在读取")?;
    let root = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    browser_html(url, &root, visible.unwrap_or(false)).await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_public_weixin_articles() {
        assert!(valid_article("https://mp.weixin.qq.com/s/test").is_ok());
        for url in ["http://mp.weixin.qq.com/s/test", "https://example.com/s/a", "https://mp.weixin.qq.com@evil.test/s/a", "https://mp.weixin.qq.com:8080/s/a", "https://mp.weixin.qq.com/cgi-bin/home"] { assert!(valid_article(url).is_err()); }
    }
}
