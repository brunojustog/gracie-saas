/**
 * v1.2-O: o app do professor (aulas, chamada, graduação) usa o tema ESCURO da
 * marca — o professor usa no celular, como app. O escopo `.dark` faz os
 * componentes shadcn (Button, cards, inputs) virarem escuros + vermelho GB,
 * sem reescrever as telas. A gestão/admin segue no tema claro.
 */
export default function ProfessorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
