// Kleine JSON-helpers rond de gedeelde DAGLOG_KV-namespace.
export async function getJSON(env, key, fallback) {
  const raw = await env.DAGLOG_KV.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function putJSON(env, key, value) {
  await env.DAGLOG_KV.put(key, JSON.stringify(value));
}
