// Tipos das respostas da API de manutenções.
import type { TipoManutencao } from "@/lib/ativos";

export type EquipamentoResumo = {
  id: string;
  identificador: string;
  apelido: string | null;
};

export type Manutencao = {
  id: string;
  tipo: TipoManutencao;
  descricao: string;
  fornecedor: string | null;
  custo: number | null;
  abertaEm: string;
  concluidaEm: string | null;
  observacoes: string | null;
  computador: EquipamentoResumo | null;
  celular: EquipamentoResumo | null;
  chamado: { id: string; numero: number; titulo: string } | null;
};
