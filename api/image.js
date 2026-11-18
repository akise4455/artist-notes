import { put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import { guard, json } from './_lib.js';

// 비교 이미지 한 장을 올리고 공개 URL을 돌려준다.
export async function POST(request) {
  const denied = await guard(request);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return json({ error: '잘못된 요청이에요.' }, 400); }
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(typeof body?.data === 'string' ? body.data : '');
  if (!match) return json({ error: '이미지 형식을 확인해 주세요.' }, 400);
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 3.3 * 1024 * 1024) return json({ error: '이미지가 너무 커요.' }, 413);
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  try {
    const blob = await put(`images/${randomUUID().replace(/-/g, '').slice(0, 16)}.${ext}`, bytes, {
      access: 'public', addRandomSuffix: false, contentType: `image/${match[1]}`, cacheControlMaxAge: 31536000,
    });
    return json({ url: blob.url });
  } catch (error) {
    console.error('image upload failed', error);
    return json({ error: '이미지를 저장하지 못했어요. (' + (error?.message || error) + ')' }, 500);
  }
}
