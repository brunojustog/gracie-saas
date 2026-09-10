/** v1.2-BC: formatação de moeda BRL compartilhada. */
export function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
