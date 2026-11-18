import { guard, json } from './_lib.js';

// 편집 비밀번호가 맞는지만 확인한다.
export async function POST(request) {
  return (await guard(request)) || json({ ok: true });
}
