// Tipos das respostas da API usados pela página de uma sala.

export type SalaResumo = {
  id: string;
  nome: string;
  predio: string | null;
  piso: string | null;
  ativa: boolean;
  observacoes?: string | null;
};

export type CelularNaSala = {
  id: string;
  identificador: string;
  apelido: string | null;
  numero: string | null;
  operadora: string | null;
};

// Computador visto de dentro da sala: traz o dono (e a sala do dono) para a
// tela poder apontar quando máquina e pessoa estão em salas diferentes.
export type ComputadorNaSala = {
  id: string;
  identificador: string;
  apelido: string | null;
  salaId: string | null;
  sala?: SalaResumo | null;
  funcionarioId: string | null;
  funcionario: {
    id: string;
    nome: string;
    cargo: string;
    salaId: string | null;
    sala: SalaResumo | null;
  } | null;
  componentes: { id: string; descricao: string; tipo: { nome: string } }[];
};

export type FuncionarioNaSala = {
  id: string;
  nome: string;
  cargo: string;
  ativo: boolean;
  salaId: string | null;
  computadores: {
    id: string;
    identificador: string;
    apelido: string | null;
    salaId: string | null;
    sala: SalaResumo | null;
  }[];
  celulares: CelularNaSala[];
};

export type DetalheSala = {
  sala: SalaResumo & { ordem: number };
  computadores: ComputadorNaSala[];
  funcionarios: FuncionarioNaSala[];
};

// Candidatos do diálogo "Trazer para esta sala" (vêm das listas gerais).
export type CandidatoComputador = {
  id: string;
  identificador: string;
  apelido: string | null;
  salaId: string | null;
  sala: SalaResumo | null;
  funcionario: { nome: string } | null;
};

export type CandidatoFuncionario = {
  id: string;
  nome: string;
  cargo: string;
  ativo: boolean;
  salaId: string | null;
  sala: SalaResumo | null;
};
