// Exercise the editor's production transport against a deployed standard proxy.
#[allow(dead_code)]
#[path = "../src/credentials.rs"]
mod credentials;
#[allow(dead_code)]
#[path = "../src/weixin_proxy.rs"]
mod weixin_proxy;

use serde_json::{Value, json};

fn success(value: Value) -> Result<Value, String> {
    match value["errcode"].as_i64() {
        Some(code) if code != 0 => Err(format!("Weixin error: {code}")),
        _ => Ok(value),
    }
}

async fn delete(client: &reqwest::Client, token: &str, path: &str, id: &str) -> Result<(), String> {
    let response = client
        .post(format!("https://api.weixin.qq.com/cgi-bin/{path}"))
        .query(&[("access_token", token)])
        .json(&json!({"media_id":id}))
        .send()
        .await
        .map_err(weixin_proxy::request_error)?;
    success(response.json().await.map_err(weixin_proxy::request_error)?)?;
    Ok(())
}

async fn workflow(client: &reqwest::Client, args: &[String]) -> Result<(), String> {
    if args.len() != 5 || args[2] != "--account" {
        return Err("Usage: proxy-file [--account private-account-file test-image]".into());
    }
    let raw = zeroize::Zeroizing::new(
        std::fs::read_to_string(&args[3]).map_err(|_| "credential-required")?,
    );
    let credential: Value = serde_json::from_str(&raw).map_err(|_| "invalid-credentials")?;
    let appid = credential["appid"].as_str().ok_or("invalid-credentials")?;
    let secret = credential["secret"].as_str().ok_or("invalid-credentials")?;
    let value = credentials::token(client, appid, secret).await?;
    let token = zeroize::Zeroizing::new(value["access_token"].as_str().unwrap().to_owned());
    success(
        weixin_proxy::request(
            client,
            "draft/batchget",
            &token,
            &json!({"offset":0,"count":1,"no_content":1}),
        )
        .await?,
    )?;
    println!("PASS: existing account stable token and draft list through the proxy");

    let image = std::fs::read(&args[4]).map_err(|_| "test-image-unavailable")?;
    let cover = success(
        weixin_proxy::upload(
            client,
            "cover",
            &token,
            image.clone(),
            "emmm-proxy-test.png".into(),
        )
        .await?,
    )?;
    let cover_id = cover["media_id"]
        .as_str()
        .ok_or("Missing cover ID")?
        .to_owned();
    let mut draft_id = None;
    let result = async {
        let body = success(
            weixin_proxy::upload(client, "body", &token, image, "emmm-proxy-test.png".into())
                .await?,
        )?;
        let url = body["url"].as_str().ok_or("Missing body image URL")?;
        println!("PASS: cover and body image uploads through the proxy");
        let mut article = json!({
            "title":"EMM 代理测试（临时）",
            "author":"EMM",
            "content":format!("<p>Temporary connection test.</p><img src=\"{url}\" />"),
            "thumb_media_id":cover_id,
            "need_open_comment":0,
            "only_fans_can_comment":0
        });
        let created = success(
            weixin_proxy::request(
                client,
                "draft/add",
                &token,
                &json!({"articles":[article.clone()]}),
            )
            .await?,
        )?;
        let id = created["media_id"]
            .as_str()
            .ok_or("Missing draft ID")?
            .to_owned();
        draft_id = Some(id.clone());
        article["title"] = json!("EMM 代理测试（更新）");
        success(
            weixin_proxy::request(
                client,
                "draft/update",
                &token,
                &json!({"media_id":id,"index":0,"articles":article}),
            )
            .await?,
        )?;
        let fetched = success(
            weixin_proxy::request(client, "draft/get", &token, &json!({"media_id":id})).await?,
        )?;
        if fetched["news_item"][0]["title"] != article["title"] {
            return Err("Updated draft title did not round-trip".into());
        }
        println!("PASS: draft creation, update and read-back through the proxy");
        Ok::<_, String>(())
    }
    .await;
    // Clean up only IDs returned by this diagnostic, even if a later check failed.
    let draft_cleanup = match draft_id {
        Some(id) => delete(client, &token, "draft/delete", &id).await,
        None => Ok(()),
    };
    let cover_cleanup = delete(client, &token, "material/del_material", &cover_id).await;
    draft_cleanup?;
    cover_cleanup?;
    result?;
    println!("PASS: temporary draft and cover material removed");
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let file = args
        .get(1)
        .ok_or("Provide a private proxy credentials JSON file")?;
    let raw = zeroize::Zeroizing::new(std::fs::read_to_string(file)?);
    let mut config: weixin_proxy::ProxyConfig = serde_json::from_str(&raw)?;
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    runtime
        .block_on(async {
            let client = weixin_proxy::client(Some(&config))?;
            weixin_proxy::test(&client).await?;
            println!(
                "PASS: native HTTPS CONNECT, proxy certificate and Weixin certificate verification"
            );
            for target in ["https://example.com/", "https://api.weixin.qq.com:444/"] {
                let error = client
                    .get(target)
                    .send()
                    .await
                    .err()
                    .ok_or("Unexpectedly allowed a forbidden target")?;
                // Hyper preserves the tunnel rejection, but not its HTTP status.
                if !format!("{error:?}").contains("TunnelUnsuccessful") {
                    return Err("Expected the proxy to reject the tunnel".to_string());
                }
            }
            println!("PASS: unrelated domains and non-443 destination ports rejected");
            if args.len() > 2 {
                workflow(&client, &args).await?;
            }
            config.password = "incorrect-password".into();
            let failure = weixin_proxy::test(&weixin_proxy::client(Some(&config))?).await;
            if failure.as_ref().err().map(String::as_str) != Some("proxy-auth-required") {
                return Err("Wrong password was not rejected as 407".to_string());
            }
            config.username.clear();
            config.password.clear();
            let failure = weixin_proxy::test(&weixin_proxy::client(Some(&config))?).await;
            if failure.as_ref().err().map(String::as_str) != Some("proxy-auth-required") {
                return Err("Anonymous access was not rejected as 407".to_string());
            }
            println!("PASS: incorrect password and anonymous access rejected before forwarding");
            Ok::<_, String>(())
        })
        .map_err(Into::into)
}
