// Tipos das respostas da API usados pela tela de Celulares e seus componentes.

export type Funcionario = {
  id: string;
  nome: string;
  cargo: string;
  ativo: boolean;
};

export type Celular = {
  id: string;
  identificador: string;
  apelido: string | null;
  numero: string | null;
  operadora: string | null;
  imei: string | null;
  observacoes: string | null;
  funcionarioId: string | null;
  funcionario: Funcionario | null;
  atualizadoEm: string; // usado para concorrência otimista na edição
};
