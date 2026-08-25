use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CosmosLookupResult {
    pub found: bool,
    pub name: Option<String>,
    pub brand: Option<String>,
    pub gpc_description: Option<String>,
    pub ncm_code: Option<String>,
    pub ncm_description: Option<String>,
    pub categories: Vec<String>,
    pub status: u16,
}

#[derive(Debug, Deserialize)]
struct CosmosGpc {
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CosmosNcm {
    code: Option<serde_json::Value>,
    description: Option<String>,
    full_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CosmosRawResponse {
    description: Option<String>,
    brand: Option<serde_json::Value>,
    gpc: Option<CosmosGpc>,
    ncm: Option<CosmosNcm>,
    categories: Option<Vec<serde_json::Value>>,
}

/// Consulta a API da Bluesoft Cosmos de forma nativa no Rust (sem restrições de CORS/User-Agent do WebView).
#[tauri::command]
pub async fn lookup_cosmos_gtin(
    gtin: String,
    token: String,
    user_agent: Option<String>,
) -> Result<CosmosLookupResult, String> {
    let clean_gtin: String = gtin.chars().filter(|c| c.is_ascii_digit()).collect();
    if clean_gtin.len() < 8 || clean_gtin.len() > 14 {
        return Ok(CosmosLookupResult::default());
    }

    let trimmed_token = token.trim();
    if trimmed_token.is_empty() {
        return Ok(CosmosLookupResult::default());
    }

    let ua = user_agent
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("MercadoPOS");

    let url = format!("https://api.cosmos.bluesoft.com.br/gtins/{}.json", clean_gtin);

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(3000))
        .build()
    {
        Ok(c) => c,
        Err(_) => return Ok(CosmosLookupResult::default()),
    };

    let response = match client
        .get(&url)
        .header("Accept", "application/json")
        .header("X-Cosmos-Token", trimmed_token)
        .header("User-Agent", ua)
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(_) => {
            // Timeout ou erro de rede -> fallback seguro
            return Ok(CosmosLookupResult::default());
        }
    };

    let status_code = response.status().as_u16();

    if status_code != 200 {
        return Ok(CosmosLookupResult {
            status: status_code,
            ..Default::default()
        });
    }

    let raw: CosmosRawResponse = match response.json().await {
        Ok(data) => data,
        Err(_) => {
            return Ok(CosmosLookupResult {
                status: status_code,
                ..Default::default()
            });
        }
    };

    let name = raw.description.and_then(|d| {
        let trimmed = d.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });

    if name.is_none() {
        return Ok(CosmosLookupResult {
            status: status_code,
            ..Default::default()
        });
    }

    // Extrai marca
    let brand = match raw.brand {
        Some(serde_json::Value::Object(map)) => map
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string()),
        Some(serde_json::Value::String(s)) => {
            let t = s.trim().to_string();
            if t.is_empty() {
                None
            } else {
                Some(t)
            }
        }
        _ => None,
    };

    // Extrai GPC e NCM
    let gpc_description = raw.gpc.and_then(|g| g.description);
    let ncm_code = raw.ncm.as_ref().and_then(|n| match &n.code {
        Some(serde_json::Value::String(s)) => Some(s.clone()),
        Some(serde_json::Value::Number(num)) => Some(num.to_string()),
        _ => None,
    });
    let ncm_description = raw.ncm.and_then(|n| n.full_description.or(n.description));

    // Extrai categorias
    let mut categories = Vec::new();
    if let Some(cat_list) = raw.categories {
        for item in cat_list {
            match item {
                serde_json::Value::Object(map) => {
                    if let Some(serde_json::Value::String(cat_name)) = map.get("name") {
                        if !cat_name.trim().is_empty() {
                            categories.push(cat_name.trim().to_string());
                        }
                    }
                }
                serde_json::Value::String(cat_name) if !cat_name.trim().is_empty() => {
                    categories.push(cat_name.trim().to_string());
                }
                _ => {}
            }
        }
    }

    Ok(CosmosLookupResult {
        found: true,
        name,
        brand,
        gpc_description,
        ncm_code,
        ncm_description,
        categories,
        status: status_code,
    })
}
