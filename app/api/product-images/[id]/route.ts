import { first } from "@/server/sql";
export async function GET(_request: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, {status: 404});
  const image = await first<{mime_type: string; data_base64: string} & Record<string, unknown>>("SELECT mime_type, data_base64 FROM product_images WHERE id = ?", id);
  if (!image) return new Response(null, {status: 404});
  return new Response(Uint8Array.from(atob(image.data_base64), c => c.charCodeAt(0)), {headers: {"content-type": image.mime_type, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'"}});
}
