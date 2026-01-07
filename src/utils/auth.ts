const copilotTokenCache = new Map<
  string,
  { token: string; expires_at: number }
>();

const kiroTokenCache = new Map<
  string,
  { token: string; expires_at: number; profile_arn?: string }
>();

/**
 * Get Copilot token with caching
 */
export async function getCopilotToken(apiKey: string): Promise<string> {
  const cached = copilotTokenCache.get(apiKey);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expires_at > now + 60) {
    return cached.token;
  }

  const response = await fetch(
    "https://api.github.com/copilot_internal/v2/token",
    {
      method: "GET",
      headers: {
        Authorization: `token ${apiKey}`,
        "Editor-Version": "vscode/1.95.3",
        "Editor-Plugin-Version": "copilot-chat/0.26.7",
        "User-Agent": "GitHubCopilotChat/0.26.7",
        "X-Github-Api-Version": "2025-04-01",
        "X-Vscode-User-Agent-Library-Version": "electron-fetch",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to get Copilot token: ${response.statusText}`);
  }

  const data = (await response.json()) as { token: string; expires_at: number };
  const token = data.token;
  const expires_at = data.expires_at;
  copilotTokenCache.set(apiKey, { token, expires_at });
  return token;
}

/**
 * Get Kiro access token with caching
 * Supports both Kiro Desktop Auth and AWS SSO OIDC
 */
export async function getKiroToken(
  refreshToken: string,
  region: string,
  clientId?: string,
  clientSecret?: string,
): Promise<string> {
  const cacheKey = `${refreshToken}:${region}:${clientId || ""}:${clientSecret || ""}`;
  const cached = kiroTokenCache.get(cacheKey);
  const now = Math.floor(Date.now() / 1000);

  // Check if token is still valid (with 5 minute buffer)
  if (cached && cached.expires_at > now + 300) {
    return cached.token;
  }

  // Determine auth type based on presence of client credentials
  const isAwsSso = clientId && clientSecret;

  let token: string;
  let expiresAt: number;
  let profileArn: string | undefined;

  if (isAwsSso) {
    // AWS SSO OIDC authentication
    const result = await refreshAwsSsoOidcToken(
      refreshToken,
      region,
      clientId!,
      clientSecret!,
    );
    token = result.accessToken;
    expiresAt = Math.floor(Date.now() / 1000) + result.expiresIn - 60; // 60 second buffer
  } else {
    // Kiro Desktop authentication
    const result = await refreshKiroDesktopToken(refreshToken, region);
    token = result.accessToken;
    expiresAt = Math.floor(Date.now() / 1000) + result.expiresIn - 60; // 60 second buffer
    profileArn = result.profileArn;
  }

  // Cache the token
  kiroTokenCache.set(cacheKey, {
    token,
    expires_at: expiresAt,
    profile_arn: profileArn,
  });

  return token;
}

async function refreshKiroDesktopToken(
  refreshToken: string,
  region: string,
): Promise<{ accessToken: string; expiresIn: number; profileArn?: string }> {
  const url = `https://prod.${region}.auth.desktop.kiro.dev/refreshToken`;
  const fingerprint = generateFingerprint();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": `KiroIDE-0.7.45-${fingerprint}`,
    },
    body: JSON.stringify({
      refreshToken: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Kiro Desktop auth failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as any;

  if (!data.accessToken) {
    throw new Error("Kiro Desktop auth response missing accessToken");
  }

  return {
    accessToken: data.accessToken,
    expiresIn: data.expiresIn || 3600,
    profileArn: data.profileArn,
  };
}

async function refreshAwsSsoOidcToken(
  refreshToken: string,
  region: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = `https://oidc.${region}.amazonaws.com/token`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grantType: "refresh_token",
      clientId: clientId,
      clientSecret: clientSecret,
      refreshToken: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `AWS SSO OIDC auth failed: ${response.status} - ${errorText}`,
    );
  }

  const data = (await response.json()) as any;

  if (!data.accessToken) {
    throw new Error("AWS SSO OIDC auth response missing accessToken");
  }

  return {
    accessToken: data.accessToken,
    expiresIn: data.expiresIn || 3600,
  };
}

function generateFingerprint(): string {
  // Simple fingerprint generation
  const hostname = "localhost";
  const username = "user";
  return btoa(`${hostname}-${username}-anythropic`).replace(
    /[^a-zA-Z0-9]/g,
    "",
  );
}
