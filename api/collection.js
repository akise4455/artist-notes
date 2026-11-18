import { get } from '@vercel/blob';
import { COLLECTION, json } from './_lib.js';

// 공개 갤러리와 편집 페이지가 읽는 목록. ?fresh 가 붙으면 캐시 없이 최신 내용을 읽는다.
export async function GET(request) {
  const fresh = new URL(request.url).searchParams.has('fresh');
  const cache = fresh ? {} : { 'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=60' };
  try {
    const result = await get(COLLECTION, { access: 'public', useCache: !fresh });
    if (!result || result.statusCode !== 200) return json({ entries: [], etag: null, empty: true }, 200, cache);
    const data = JSON.parse(await new Response(result.stream).text());
    return json({ ...data, etag: result.blob.etag }, 200, cache);
  } catch (error) {
    if (error?.name === 'BlobNotFoundError') return json({ entries: [], etag: null, empty: true }, 200, cache);
    return json({ error: '목록을 불러오지 못했어요.' }, 500);
  }
}
