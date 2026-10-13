// Instagram API with Instagram Login. 오류 메시지에 토큰이 섞이지 않도록 URL은 남기지 않습니다.
const host = 'https://graph.instagram.com';
const version = 'v26.0';

type GraphError = { error?: { message?: string; code?: number } };

async function call<T>(method: 'GET' | 'POST', path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  const res =
    method === 'GET'
      ? await fetch(`${host}/${path}?${query}`)
      : await fetch(`${host}/${path}`, { method, body: query });
  const data = (await res.json()) as T & GraphError;
  if (!res.ok || data.error) {
    throw new Error(
      `Instagram ${method} ${path.split('?')[0]}: ${data.error?.message ?? res.status}`,
    );
  }
  return data;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function instagram(token: string) {
  const get = <T>(path: string, params: Record<string, string> = {}) =>
    call<T>('GET', `${version}/${path}`, { ...params, access_token: token });
  const post = <T>(path: string, params: Record<string, string>) =>
    call<T>('POST', `${version}/${path}`, { ...params, access_token: token });

  async function waitReady(containerId: string) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const { status_code, status } = await get<{ status_code: string; status?: string }>(
        containerId,
        { fields: 'status_code,status' },
      );
      if (status_code === 'FINISHED') return;
      if (status_code === 'ERROR' || status_code === 'EXPIRED') {
        throw new Error(`컨테이너 ${containerId} ${status_code}: ${status ?? ''}`);
      }
      await sleep(3000);
    }
    throw new Error(`컨테이너 ${containerId}가 2분 안에 준비되지 않았습니다`);
  }

  return {
    me: () => get<{ user_id: string; username: string }>('me', { fields: 'user_id,username' }),
    async quotaLeft(userId: string) {
      const { data } = await get<{
        data: { quota_usage: number; config: { quota_total: number } }[];
      }>(`${userId}/content_publishing_limit`, { fields: 'quota_usage,config' });
      return data[0].config.quota_total - data[0].quota_usage;
    },
    recentMedia: (userId: string) =>
      get<{ data: { id: string; caption?: string; permalink: string }[] }>(`${userId}/media`, {
        fields: 'id,caption,permalink',
        limit: '10',
      }),
    async createCarousel(userId: string, imageUrls: string[], caption: string) {
      const children: string[] = [];
      for (const image_url of imageUrls) {
        const { id } = await post<{ id: string }>(`${userId}/media`, {
          image_url,
          is_carousel_item: 'true',
        });
        children.push(id);
      }
      for (const id of children) await waitReady(id);
      const { id } = await post<{ id: string }>(`${userId}/media`, {
        media_type: 'CAROUSEL',
        children: children.join(','),
        caption,
      });
      await waitReady(id);
      return id;
    },
    publish: (userId: string, creationId: string) =>
      post<{ id: string }>(`${userId}/media_publish`, { creation_id: creationId }),
    permalink: (mediaId: string) => get<{ permalink: string }>(mediaId, { fields: 'permalink' }),
  };
}

// 장기 토큰(60일)은 발급 24시간 뒤부터 갱신할 수 있습니다. 버전 없는 경로를 씁니다.
export function refreshToken(token: string) {
  return call<{ access_token: string; expires_in: number }>('GET', 'refresh_access_token', {
    grant_type: 'ig_refresh_token',
    access_token: token,
  });
}
