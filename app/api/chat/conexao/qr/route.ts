import { NextResponse } from "next/server";
import { erro } from "@/lib/api";
import { exigirAdmin } from "@/lib/autorizacao";
import { configWaha, qrCode } from "@/lib/waha";

// GET /api/chat/conexao/qr — a imagem do QR de pareamento.
//
// Por que passar pelo app em vez de a tela apontar direto para o gateway: a
// chave da API do WAHA é segredo de servidor e não pode ir para o navegador, o
// gateway só escuta na LAN (127.0.0.1:3001) e a CSP deste app (`img-src 'self'`)
// barraria uma imagem de outra origem. Aqui a imagem é da própria origem.
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;

  const cfg = configWaha();
  if (!cfg) return erro("Modo direto não configurado (WAHA_URL ausente).", 503);

  const r = await qrCode(cfg);
  if (!r.ok) return erro(r.motivo, r.status);

  return new NextResponse(r.dados.bytes, {
    headers: {
      "content-type": r.dados.tipo,
      // O QR vira em segundos e é credencial de pareamento: nada de cache, nem
      // no navegador nem em proxy no meio do caminho.
      "cache-control": "no-store, must-revalidate",
    },
  });
}
