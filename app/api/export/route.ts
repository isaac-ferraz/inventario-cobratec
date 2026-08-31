import { NextResponse } from "next/server";
import { gerarWorkbook } from "@/lib/excel";
import { exigirAdmin } from "@/lib/autorizacao";

// Sempre gerar a partir dos dados atuais do banco (nunca cachear).
export const dynamic = "force-dynamic";

// GET /api/export — gera e baixa o .xlsx com os dados atuais do banco.
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await exigirAdmin(req);
  if ("resposta" in auth) return auth.resposta;
  try {
    const buffer = await gerarWorkbook();
    const dataStr = new Date().toISOString().slice(0, 10);
    // `Buffer` do Node não é um `BodyInit` válido para a tipagem do fetch; a
    // view sobre os mesmos bytes é, e não copia nada.
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="inventario-cobratec-${dataStr}.xlsx"`,
      },
    });
  } catch (e) {
    console.error("Erro ao gerar Excel:", e);
    return NextResponse.json(
      { erro: "Falha ao gerar o relatório Excel." },
      { status: 500 },
    );
  }
}
