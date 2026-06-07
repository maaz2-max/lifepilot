function supabaseConfig(env = process.env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return { url: String(url || "").replace(/\/$/, ""), key };
}

export function hasSupabase(env = process.env) {
  const { url, key } = supabaseConfig(env);
  return Boolean(url && key);
}

export async function supabaseRequest(path, { method = "GET", body, headers = {} } = {}, env = process.env) {
  const { url, key } = supabaseConfig(env);
  if (!url || !key) throw new Error("Supabase is not configured");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = data?.message || data?.error || response.statusText;
    throw new Error(detail || "Supabase request failed");
  }
  return data;
}
