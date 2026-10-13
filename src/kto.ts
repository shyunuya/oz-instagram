// 한국관광공사 관광사진 정보 API (공공데이터포털 15101914). 사진은 공공누리 제1유형입니다.
const base = 'https://apis.data.go.kr/B551011/PhotoGalleryService1';
const pageSize = 100;

export type KtoPhoto = {
  id: string;
  title: string;
  imageUrl: string;
  photographer: string;
  location: string;
  shotMonth: string;
  createdAt: string;
  keywords: string[];
};
type KtoItem = Partial<
  Record<
    | 'galContentId'
    | 'galTitle'
    | 'galWebImageUrl'
    | 'galPhotographer'
    | 'galPhotographyLocation'
    | 'galPhotographyMonth'
    | 'galCreatedtime'
    | 'galSearchKeyword',
    string | number
  >
>;

export function toPhoto(item: KtoItem): KtoPhoto {
  const text = (value: string | number | undefined) => String(value ?? '').trim();
  return {
    id: text(item.galContentId),
    title: text(item.galTitle),
    imageUrl: text(item.galWebImageUrl),
    photographer: text(item.galPhotographer),
    location: text(item.galPhotographyLocation),
    shotMonth: text(item.galPhotographyMonth),
    createdAt: text(item.galCreatedtime),
    keywords: text(item.galSearchKeyword)
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  };
}

// 결과가 없으면 items가 빈 문자열이고, 1건이면 item이 배열이 아닌 객체로 옵니다.
export function readItems(items: unknown): KtoItem[] {
  if (!items || typeof items !== 'object') return [];
  const item = (items as { item?: KtoItem | KtoItem[] }).item;
  return item ? [item].flat() : [];
}

async function searchPage(serviceKey: string, keyword: string, pageNo: number) {
  const url = new URL(`${base}/gallerySearchList1`);
  url.search = new URLSearchParams({
    serviceKey: decodeURIComponent(serviceKey),
    keyword,
    MobileOS: 'ETC',
    MobileApp: 'oz-instagram',
    _type: 'json',
    numOfRows: String(pageSize),
    pageNo: String(pageNo),
  }).toString();
  const res = await fetch(url);
  const body = await res.text();
  // 인증키 오류는 _type=json이어도 XML로 옵니다.
  if (!res.ok || !body.trimStart().startsWith('{')) {
    throw new Error(`KTO ${res.status}: ${body.slice(0, 300)}`);
  }
  const { response } = JSON.parse(body);
  if (response.header.resultCode !== '0000') {
    throw new Error(`KTO ${response.header.resultCode}: ${response.header.resultMsg}`);
  }
  return {
    photos: readItems(response.body.items).map(toPhoto),
    totalCount: Number(response.body.totalCount),
  };
}

export async function searchPhotos(serviceKey: string, keyword: string) {
  const photos: KtoPhoto[] = [];
  for (let pageNo = 1; ; pageNo++) {
    const page = await searchPage(serviceKey, keyword, pageNo);
    photos.push(...page.photos);
    if (!page.photos.length || photos.length >= page.totalCount) return photos;
  }
}
