import { formatBRL } from "@/lib/money";

/**
 * v1.2-BC: valor financeiro sensível. No "modo discrição" (olho fechado) fica
 * borrado até clicar. A classe `gb-money` é o gancho do CSS + do listener de
 * "espiar" (MoneyProvider). Preços de catálogo NÃO usam este componente.
 *
 * Componente de apresentação puro (sem estado) — funciona em Server e Client.
 */
export function Money({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (value == null) {
    return <span className={className}>—</span>;
  }
  return (
    <span className={className ? `gb-money ${className}` : "gb-money"}>
      {formatBRL(value)}
    </span>
  );
}
