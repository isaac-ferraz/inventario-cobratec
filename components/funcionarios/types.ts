// Tipos da resposta de GET /api/funcionarios/[id] — o perfil da pessoa.
import type { Computador, Sala } from "@/components/computadores/types";

export type CelularDoFuncionario = {
  id: string;
  identificador: string;
  apelido: string | null;
  numero: string | null;
  operadora: string | null;
  imei: string | null;
  situacao: string;
  garantiaAte: string | null;
};

export type ChamadoDoFuncionario = {
  id: string;
  numero: number;
  titulo: string;
  status: string;
  prioridade: string;
  criadoEm: string;
};

export type PerfilFuncionario = {
  id: string;
  nome: string;
  cargo: string;
  ativo: boolean;
  salaId: string | null;
  sala: Sala | null;
  loginSiscobra: string | null;
  senhaSiscobra: string | null;
  loginVonix: string | null;
  senhaVonix: string | null;
  criadoEm: string;
  computadores: Computador[];
  celulares: CelularDoFuncionario[];
  usuarios: { id: string; login: string; papel: string; ativo: boolean }[];
  chamados: ChamadoDoFuncionario[];
};
