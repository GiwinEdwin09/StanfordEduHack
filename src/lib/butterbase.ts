type QueryValue = string | number | undefined;

function getConfig() {
  const apiUrl = process.env.BUTTERBASE_API_URL;
  const apiKey = process.env.BUTTERBASE_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error(
      "Butterbase is not configured. Set BUTTERBASE_API_URL and BUTTERBASE_API_KEY.",
    );
  }

  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    apiKey,
  };
}

async function butterbaseRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { apiUrl, apiKey } = getConfig();
  const response = await fetch(`${apiUrl}/${path.replace(/^\//, "")}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const body = await response.text();
  const parsed = body ? (JSON.parse(body) as unknown) : null;

  if (!response.ok) {
    const detail =
      parsed && typeof parsed === "object" && "message" in parsed
        ? String(parsed.message)
        : `Butterbase request failed with status ${response.status}`;
    throw new Error(detail);
  }

  return parsed as T;
}

function unwrapData<T>(payload: T | { data: T }): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    Object.keys(payload).length === 1
  ) {
    return payload.data;
  }

  return payload as T;
}

export function getRow<T>(table: string, id: string) {
  return butterbaseRequest<T | { data: T }>(
    `${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
  ).then(unwrapData);
}

export function listRows<T>(
  table: string,
  query: Record<string, QueryValue> = {},
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return butterbaseRequest<T[] | { data: T[] }>(
    `${encodeURIComponent(table)}${suffix}`,
  ).then(unwrapData);
}

export function insertRow<T>(table: string, values: Record<string, unknown>) {
  return butterbaseRequest<T | { data: T }>(
    encodeURIComponent(table),
    {
      method: "POST",
      body: JSON.stringify(values),
    },
  ).then(unwrapData);
}

export function updateRow<T>(
  table: string,
  id: string,
  values: Record<string, unknown>,
) {
  return butterbaseRequest<T | { data: T }>(
    `${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(values),
    },
  ).then(unwrapData);
}

export function deleteRow(table: string, id: string) {
  return butterbaseRequest<unknown>(
    `${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}
