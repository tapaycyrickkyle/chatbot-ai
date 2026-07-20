import "server-only";

const GRAPH_API_BASE_URL = "https://graph.facebook.com/v20.0";
const MAX_FACEBOOK_PAGE_BATCHES = 25;

export type FacebookAccountPage = {
  id: string;
  name: string;
  access_token?: string;
};

type FacebookAccountsResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    access_token?: string;
  }>;
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
  };
};

function getInitialAccountsUrl(includeAccessToken: boolean) {
  const fields = includeAccessToken ? "id,name,access_token" : "id,name";
  const params = new URLSearchParams({
    fields,
    limit: "100",
  });

  return `${GRAPH_API_BASE_URL}/me/accounts?${params.toString()}`;
}

function isSafeGraphApiNextUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "graph.facebook.com";
  } catch {
    return false;
  }
}

export async function getFacebookAccountPages(
  userToken: string,
  options: { includeAccessToken?: boolean } = {}
) {
  const pages = new Map<string, FacebookAccountPage>();
  let nextUrl: string | null = getInitialAccountsUrl(Boolean(options.includeAccessToken));

  for (let batch = 0; nextUrl && batch < MAX_FACEBOOK_PAGE_BATCHES; batch += 1) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });
    const data = (await response.json()) as FacebookAccountsResponse;

    if (!response.ok) {
      throw new Error(data.error?.message || "Failed to load Facebook pages");
    }

    for (const page of data.data ?? []) {
      if (!page.id || !page.name) {
        continue;
      }

      pages.set(page.id, {
        id: page.id,
        name: page.name,
        access_token: page.access_token,
      });
    }

    const next = data.paging?.next;
    nextUrl = next && isSafeGraphApiNextUrl(next) ? next : null;
  }

  return Array.from(pages.values());
}
