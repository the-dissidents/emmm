use serde_json::{Value, json};
use zeroize::Zeroizing;

#[tauri::command]
pub async fn get_weixin_token(
    appid: String,
    secret: String,
    proxy: Option<crate::weixin_proxy::ProxyConfig>,
) -> Result<Value, String> {
    let secret = Zeroizing::new(secret);
    if appid.is_empty() || appid.len() > 128 || secret.is_empty() || secret.len() > 256 {
        return Err("invalid-credentials".into());
    }
    let client = crate::weixin_proxy::client(proxy.as_ref())?;
    token(&client, &appid, &secret).await
}

pub(crate) async fn token(
    client: &reqwest::Client,
    appid: &str,
    secret: &str,
) -> Result<Value, String> {
    let response = client
        .post("https://api.weixin.qq.com/cgi-bin/stable_token")
        .json(&json!({"grant_type":"client_credential","appid":appid,"secret":secret}))
        .send()
        .await
        .map_err(crate::weixin_proxy::request_error)?;
    if !response.status().is_success() {
        return Err("weixin-unavailable".into());
    }
    let value: Value = response.json().await.map_err(|_| "weixin-unavailable")?;
    if value["access_token"].as_str().is_none() || value["expires_in"].as_u64().is_none() {
        return Err(format!(
            "weixin-error:{}",
            value["errcode"].as_i64().unwrap_or(-1)
        ));
    }
    Ok(value)
}
