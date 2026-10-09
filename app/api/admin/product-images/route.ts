import { requireAdmin } from "@/server/auth";
import { assertDomain, jsonResponse, withRoute } from "@/server/domain";
import { run } from "@/server/sql";

export function POST(request: Request) { return withRoute(async () => {
  await requireAdmin(request);
  assertDomain(Number(request.headers.get("content-length") ?? 0) <= 3_000_000, "IMAGE_TOO_LARGE", "Fotografija može imati najviše 2 MB.", 413);
  const file = (await request.formData()).get("image");
  assertDomain(file instanceof File && file.size > 0 && file.size <= 2_000_000, "IMAGE_INVALID", "Izaberite JPG, PNG ili WebP fotografiju do 2 MB.", 422);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  assertDomain(png || jpg || webp, "IMAGE_INVALID", "Podržane su JPG, PNG i WebP fotografije.", 422);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const id = crypto.randomUUID();
  await run("INSERT INTO product_images (id, mime_type, data_base64) VALUES (?, ?, ?)", id, png ? "image/png" : jpg ? "image/jpeg" : "image/webp", btoa(binary));
  return jsonResponse({url: `/api/product-images/${id}`}, 201);
}); }
