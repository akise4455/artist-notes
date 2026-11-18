import { createHash, timingSafeEqual } from 'node:crypto';

export const COLLECTION = 'collection.json';
export const IMAGE_URL = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/images\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

const digest = (value) => createHash('sha256').update(String(value)).digest();

/** 편집 요청인지 확인한다. 문제가 있으면 돌려줄 응답을, 괜찮으면 null을 반환한다. */
export async function guard(request) {
  const expected = process.env.EDIT_PASSWORD;
  if (!expected) return json({ error: '편집 비밀번호가 아직 설정되지 않았어요. Vercel 프로젝트 설정에 EDIT_PASSWORD를 추가해 주세요.' }, 503);
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return json({ error: '저장 공간(Blob)이 아직 연결되지 않았어요.' }, 503);
  let given = request.headers.get('x-edit-password') || '';
  try { given = decodeURIComponent(given); } catch { /* 그대로 비교 */ }
  if (!timingSafeEqual(digest(given), digest(expected))) {
    await new Promise((resolve) => setTimeout(resolve, 800)); // 비밀번호 대입을 느리게
    return json({ error: '비밀번호가 맞지 않아요.' }, 401);
  }
  return null;
}
