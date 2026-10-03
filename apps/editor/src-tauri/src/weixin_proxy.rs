use reqwest::{Client, Proxy, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use zeroize::Zeroize;

#[derive(Deserialize, Serialize)]
pub(crate) struct ProxyConfig {
    pub endpoint: String,
    pub username: String,
    pub password: String,
    pub certificate: String,
}

impl Drop for ProxyConfig {
    fn drop(&mut self) {
        self.password.zeroize();
    }
}

fn endpoint(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "invalid-proxy-url")?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("invalid-proxy-url".into());
    }
    Ok(url)
}

pub(crate) fn client(settings: Option<&ProxyConfig>) -> Result<Client, String> {
    let mut builder = Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(55));
    if let Some(settings) = settings {
        if settings.username.len() > 128
            || settings.username.contains(':')
            || settings.username.chars().any(char::is_control)
            || (!settings.username.is_empty() && settings.password.is_empty())
            || settings.password.len() > 512
        {
            return Err("invalid-proxy-credentials".into());
        }
        let mut proxy = Proxy::https(endpoint(&settings.endpoint)?.as_str())
            .map_err(|_| "invalid-proxy-url")?;
        if !settings.username.is_empty() {
            proxy = proxy.basic_auth(&settings.username, &settings.password);
        }
        builder = builder.proxy(proxy);
        if !settings.certificate.is_empty() {
            builder = builder.add_root_certificate(
                reqwest::Certificate::from_pem(settings.certificate.as_bytes())
                    .map_err(|_| "invalid-proxy-certificate")?,
            );
        }
    }
    builder.build().map_err(|_| "weixin-unavailable".into())
}

pub(crate) fn request_error(error: reqwest::Error) -> String {
    // CONNECT failures are nested transport errors, not origin HTTP responses.
    let mut cause: Option<&dyn std::error::Error> = Some(&error);
    while let Some(error) = cause {
        let message = error.to_string().to_lowercase();
        if message.contains("407")
            || message.contains("proxy authentication required")
            || message.contains("proxy authorization required")
        {
            return "proxy-auth-required".into();
        }
        if message.contains("certificate") || message.contains("unknownissuer") {
            return "invalid-proxy-certificate".into();
        }
        cause = error.source();
    }
    "weixin-unavailable".into()
}

async fn json(response: reqwest::Response) -> Result<Value, String> {
    if !response.status().is_success() {
        return Err(if response.status().as_u16() == 429 {
            "rate-limited"
        } else {
            "weixin-unavailable"
        }
        .into());
    }
    response.json().await.map_err(request_error)
}

#[tauri::command]
pub fn validate_weixin_proxy(mut settings: ProxyConfig) -> Result<ProxyConfig, String> {
    settings.endpoint = endpoint(&settings.endpoint)?.to_string();
    if settings.username.is_empty() {
        settings.password.clear();
    }
    client(Some(&settings))?;
    Ok(settings)
}

pub(crate) async fn test(client: &Client) -> Result<(), String> {
    let value = json(
        client
            .get("https://api.weixin.qq.com/cgi-bin/get_api_domain_ip")
            .send()
            .await
            .map_err(request_error)?,
    )
    .await?;
    // A missing-token response proves the tunnel reached the actual Weixin API.
    if value["errcode"].as_i64() != Some(41001) {
        return Err("weixin-unavailable".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn test_weixin_proxy(settings: ProxyConfig) -> Result<(), String> {
    test(&client(Some(&settings))?).await
}

#[tauri::command]
pub async fn proxy_weixin_request(
    settings: ProxyConfig,
    path: String,
    token: String,
    body: Value,
) -> Result<Value, String> {
    request(&client(Some(&settings))?, &path, &token, &body).await
}

pub(crate) async fn request(
    client: &Client,
    path: &str,
    token: &str,
    body: &Value,
) -> Result<Value, String> {
    if !matches!(
        path,
        "material/batchget_material"
            | "material/get_material"
            | "draft/batchget"
            | "draft/get"
            | "draft/add"
            | "draft/update"
            | "freepublish/batchget"
    ) {
        return Err("invalid-weixin-operation".into());
    }
    json(
        client
            .post(format!("https://api.weixin.qq.com/cgi-bin/{path}"))
            .query(&[("access_token", token)])
            .json(body)
            .send()
            .await
            .map_err(request_error)?,
    )
    .await
}

#[tauri::command]
pub async fn proxy_weixin_upload(
    settings: ProxyConfig,
    kind: String,
    token: String,
    bytes: Vec<u8>,
    name: String,
) -> Result<Value, String> {
    upload(&client(Some(&settings))?, &kind, &token, bytes, name).await
}

pub(crate) async fn upload(
    client: &Client,
    kind: &str,
    token: &str,
    bytes: Vec<u8>,
    name: String,
) -> Result<Value, String> {
    let path = match kind {
        "body" => "media/uploadimg",
        "cover" => "material/add_material",
        _ => return Err("invalid-weixin-operation".into()),
    };
    let form = reqwest::multipart::Form::new().part(
        "media",
        reqwest::multipart::Part::bytes(bytes).file_name(name),
    );
    let mut request = client
        .post(format!("https://api.weixin.qq.com/cgi-bin/{path}"))
        .query(&[("access_token", token)])
        .multipart(form);
    if kind == "cover" {
        request = request.query(&[("type", "image")]);
    }
    json(request.send().await.map_err(request_error)?).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proxy_addresses_require_tls_and_separate_credentials() {
        assert!(endpoint("https://proxy.example:8443").is_ok());
        for url in [
            "http://proxy.example",
            "socks5://proxy.example",
            "https://user:secret@proxy.example",
            "https://proxy.example/api",
            "https://proxy.example?token=secret",
            "https://proxy.example/#x",
        ] {
            assert!(endpoint(url).is_err(), "{url}");
        }
    }
}
