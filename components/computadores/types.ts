// Tipos das respostas da API usados pela tela de Computadores e seus
// componentes. Centralizados aqui para não duplicar/desencontrar entre arquivos.

export type Funcionario = {
  id: string;
  nome: string;
  cargo: string;
  ativo: boolean;
};

export type Tipo = { id: string; nome: string };

export type Componente = {
  id: string;
  tipoId: string;
  descricao: string;
  especificacoes: Record<string, unknown> | null;
  tipo: { id: string; nome: string };
};

export type Computador = {
  id: string;
  identificador: string;
  apelido: string | null;
  observacoes: string | null;
  loginPadrao: string | null;
  licencaWindows: string | null;
  licencaMicrosoft: string | null;
  contaOutlook: string | null;
  temMouse: boolean;
  temTeclado: boolean;
  temHeadset: boolean;
  funcionarioId: string | null;
  funcionario: Funcionario | null;
  componentes: Componente[];
  atualizadoEm: string; // usado para concorrência otimista na edição
};

export type Spec = { chave: string; valor: string };
