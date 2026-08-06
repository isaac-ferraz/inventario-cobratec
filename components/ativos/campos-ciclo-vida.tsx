"use client";

// Bloco de ciclo de vida reutilizado pelos formulários de computador e celular:
// os dois têm exatamente os mesmos campos, e duplicar o formulário faria as
// duas telas divergirem com o tempo.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROTULO_SITUACAO, SITUACOES } from "@/lib/ativos";

export type ValoresCicloVida = {
  situacao: string;
  dataAquisicao: string; // "AAAA-MM-DD" (formato do <input type="date">)
  notaFiscal: string;
  garantiaAte: string;
  valorCompra: string;
};

export const CICLO_VIDA_VAZIO: ValoresCicloVida = {
  situacao: "ativo",
  dataAquisicao: "",
  notaFiscal: "",
  garantiaAte: "",
  valorCompra: "",
};

// A API devolve ISO ("2026-08-06T12:00:00.000Z"); o input quer só a data.
export function paraInputData(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function CamposCicloVida({
  valores,
  onChange,
  desabilitaSituacao = false,
}: {
  valores: ValoresCicloVida;
  onChange: (v: ValoresCicloVida) => void;
  desabilitaSituacao?: boolean;
}) {
  const set = (campo: keyof ValoresCicloVida, valor: string) =>
    onChange({ ...valores, [campo]: valor });

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="mb-3 text-xs font-medium text-muted-foreground">
        Ciclo de vida (opcional)
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Situação</Label>
          <Select
            value={valores.situacao}
            onValueChange={(v) => set("situacao", v)}
            disabled={desabilitaSituacao}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SITUACOES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ROTULO_SITUACAO[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {desabilitaSituacao && (
            <p className="text-xs text-muted-foreground">
              Em manutenção — a situação volta ao concluir o conserto.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cv-nf">Nota fiscal</Label>
          <Input
            id="cv-nf"
            value={valores.notaFiscal}
            onChange={(e) => set("notaFiscal", e.target.value)}
            placeholder="Número / observação"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cv-aq">Data de aquisição</Label>
          <Input
            id="cv-aq"
            type="date"
            value={valores.dataAquisicao}
            onChange={(e) => set("dataAquisicao", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cv-gar">Garantia até</Label>
          <Input
            id="cv-gar"
            type="date"
            value={valores.garantiaAte}
            onChange={(e) => set("garantiaAte", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cv-valor">Valor de compra (R$)</Label>
          <Input
            id="cv-valor"
            value={valores.valorCompra}
            onChange={(e) => set("valorCompra", e.target.value)}
            placeholder="Ex: 3.200,00"
            inputMode="decimal"
          />
        </div>
      </div>
    </div>
  );
}
