import "./aluno.css";

/** v1.2-H: casca do app do aluno — aplica o tema Gracie Barra (escuro,
 * vermelho/azul/branco). As telas de gestão seguem com o tema padrão. */
export default function AlunoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="gb-aluno">{children}</div>;
}
