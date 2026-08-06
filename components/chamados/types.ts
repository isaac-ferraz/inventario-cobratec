// Tipos das respostas da API de chamados.
import type { Prioridade, Status } from "@/lib/chamados";

export type UsuarioResumo = {
  id: string;
  nome: string;
  login: string;
  papel?: "ADMIN" | "OPERADOR";
};

export type EquipamentoResumo = {
  id: string;
  identificador: string;
  apelido: string | null;
  numero?: string | null;
};

export type ChamadoLista = {
  id: string;
  numero: number;
  titulo: string;
  categoria: string | null;
  prioridade: Prioridade;
  status: Status;
  criadoEm: string;
  atualizadoEm: string;
  resolvidoEm: string | null;
  solicitante: UsuarioResumo;
  responsavel: UsuarioResumo | null;
  computador: EquipamentoResumo | null;
  celular: EquipamentoResumo | null;
  sala: { id: string; nome: string } | null;
  _count: { mensagens: number };
};

export type Mensagem = {
  id: string;
  corpo: string;
  interna: boolean;
  criadoEm: string;
  autor: UsuarioResumo;
};

export type ChamadoDetalhe = Omit<ChamadoLista, "_count"> & {
  descricao: string;
  solicitanteId: string;
  solicitante: UsuarioResumo & {
    funcionario: { nome: string; cargo: string } | null;
  };
  mensagens: Mensagem[];
};

export type ContextoChamado = {
  computadores: EquipamentoResumo[];
  celulares: EquipamentoResumo[];
  sala: { id: string; nome: string } | null;
};
