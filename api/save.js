import { put, list, del, BlobPreconditionFailedError } from '@vercel/blob';
import { COLLECTION, IMAGE_URL, guard, json } from './_lib.js';

function clean(entries) {
  if (!Array.isArray(entries) || entries.length > 5000) throw Error('목록 형식을 확인해 주세요.');
  return entries.map((x) => {
    if (!x || typeof x.tag !== 'string' || !x.tag.trim() || x.tag.length > 150) throw Error('태그 형식을 확인해 주세요.');
    if (x.image && !(typeof x.image === 'string' && IMAGE_URL.test(x.image))) throw Error('이미지를 먼저 올려 주세요.');
    return {
      id: typeof x.id === 'string' ? x.id.slice(0, 64) : '',
      tag: x.tag.trim(),
      labels: Array.isArray(x.labels) ? x.labels.filter((v) => typeof v === 'string').slice(0, 20).map((v) => v.slice(0, 50)) : [],
      note: typeof x.note === 'string' ? x.note.slice(0, 1500) : '',
      image: x.image || '',
      created: Number.isFinite(x.created) ? x.created : Date.now(),
    };
  });
}

// 더 이상 어떤 태그도 쓰지 않는 이미지를 지운다. 방금 올라온 이미지는 건드리지 않는다.
async function removeUnusedImages(entries) {
  const used = new Set(entries.filter((x) => x.image).map((x) => new URL(x.image).pathname.slice(1)));
  const cutoff = Date.now() - 10 * 60 * 1000;
  const stale = [];
  let cursor;
  do {
    const page = await list({ prefix: 'images/', cursor, limit: 1000 });
    for (const blob of page.blobs) if (!used.has(blob.pathname) && new Date(blob.uploadedAt).getTime() < cutoff) stale.push(blob.url);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (stale.length) await del(stale);
}

// 목록 전체를 저장한다. etag가 다르면(다른 기기에서 먼저 저장했으면) 덮어쓰지 않는다.
export async function POST(request) {
  const denied = await guard(request);
  if (denied) return denied;
  let body, entries;
  try { body = await request.json(); entries = clean(body?.entries); }
  catch (error) { return json({ error: error.message || '잘못된 요청이에요.' }, 400); }
  const text = JSON.stringify({ version: 3, updatedAt: new Date().toISOString(), entries }, null, 1);
  const options = { access: 'public', addRandomSuffix: false, contentType: 'application/json; charset=utf-8', cacheControlMaxAge: 60 };
  if (typeof body.etag === 'string' && body.etag) options.ifMatch = body.etag;
  else options.allowOverwrite = false;
  let blob;
  try { blob = await put(COLLECTION, text, options); }
  catch (error) {
    if (error instanceof BlobPreconditionFailedError || /exist|precondition/i.test(error?.message || ''))
      return json({ error: '다른 기기에서 먼저 저장한 내용이 있어요. 새로고침한 뒤 다시 저장해 주세요.', conflict: true }, 409);
    console.error('save failed', error);
    return json({ error: '저장하지 못했어요. (' + (error?.message || error) + ')' }, 500);
  }
  try { await removeUnusedImages(entries); } catch (error) { console.error('cleanup failed', error); /* 다음 저장 때 다시 시도 */ }
  return json({ ok: true, etag: blob.etag });
}
