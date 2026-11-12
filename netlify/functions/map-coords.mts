// GET /.netlify/functions/map-coords?url=<Google Maps link>
// Follows Google Maps short links (maps.app.goo.gl / goo.gl) and returns the pin's {lat, lng},
// so staff can paste the venue's map link and check-in/out can test the 100 m radius.
// Only Google Maps hosts are fetched.

const ALLOWED = /^(maps\.app\.goo\.gl|goo\.gl|(www\.|maps\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)$/i;

function coordsFrom(text: string): { lat: number; lng: number } | null {
  const t = decodeURIComponent(text.replace(/\+/g, " "));
  const patterns = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, // place pin (most precise)
    /[?&](?:q|query|ll|destination|center)=\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
    /\/(?:search|place|dir)\/\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, // map centre
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export default async (req: Request) => {
  const raw = new URL(req.url).searchParams.get("url")?.trim() ?? "";
  const direct = raw.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  if (direct) return json({ lat: Number(direct[1]), lng: Number(direct[2]) });
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return json({ error: "ลิงก์ไม่ถูกต้อง" }, 400);
  }
  const found = coordsFrom(url.href);
  if (found) return json(found);

  for (let hop = 0; hop < 6; hop++) {
    if (url.protocol !== "https:" || !ALLOWED.test(url.hostname)) return json({ error: "รองรับเฉพาะลิงก์ Google Maps" }, 400);
    let res: Response;
    try {
      res = await fetch(url.href, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (compatible; map-coords)", "accept-language": "th,en" } });
    } catch {
      return json({ error: "เปิดลิงก์แผนที่ไม่ได้" }, 502);
    }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url);
      const c = coordsFrom(url.href);
      if (c) return json(c);
      continue;
    }
    if (!res.ok) return json({ error: "เปิดลิงก์แผนที่ไม่ได้" }, 502);
    const html = (await res.text()).slice(0, 2_000_000);
    const c =
      coordsFrom(html) ??
      // embedded map state: [[[zoom, lng, lat], …
      (() => {
        const m = html.match(/\[\[\[\d+(?:\.\d+)?,(-?\d{1,3}\.\d+),(-?\d{1,2}\.\d+)\]/);
        return m ? { lat: Number(m[2]), lng: Number(m[1]) } : null;
      })();
    if (c) return json(c);
    return json({ error: "ไม่พบพิกัดในลิงก์นี้ กรุณากดปุ่มใช้ตำแหน่งปัจจุบัน หรือกรอกละติจูด/ลองจิจูดเอง" }, 422);
  }
  return json({ error: "ลิงก์เปลี่ยนเส้นทางหลายครั้งเกินไป" }, 502);
};
