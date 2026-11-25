import type { Metadata } from "next";
import { LegalPage } from "@/components/shop/legal-page";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = {
  title: "Trocas e devoluções",
  description: "Arrependimento em até 7 dias, produto com defeito e como pedir a troca ou a devolução.",
};

export default async function ReturnsPage() {
  const settings = await getSettings();
  return (
    <LegalPage title="Trocas e devoluções" updated="novembro de 2026" settings={settings}>
      <p>Seguimos o Código de Defesa do Consumidor (Lei nº 8.078/1990). Em resumo:</p>

      <h2>Arrependimento (compra pelo site)</h2>
      <p>
        Você pode desistir da compra em até <strong>7 dias corridos</strong> contados do recebimento do produto, sem precisar explicar o motivo. Devolva o produto no estado em que recebeu (com embalagem, lacre e acessórios, quando houver) e a loja devolve o valor pago, incluindo o frete.
      </p>

      <h2>Produto com defeito ou diferente do anunciado</h2>
      <p>
        Fale com a loja o quanto antes. O prazo legal para reclamar de vício aparente é de <strong>90 dias</strong> para produtos duráveis (como miniaturas e colecionáveis), contados do recebimento. Conferir o produto assim que chegar, com fotos da embalagem e do item, ajuda a resolver mais rápido.
      </p>

      <h2>Itens de coleção: o que conferir</h2>
      <ul>
        <li>Cada anúncio informa o estado do produto (lacrado, solto, com caixa danificada etc.). Leia a descrição e as fotos antes de comprar.</li>
        <li>Pequenas marcas de armazenamento em caixas e cartelas de itens antigos podem fazer parte do estado informado no anúncio.</li>
      </ul>

      <h2>Como pedir</h2>
      <ol className="list-decimal space-y-1 pl-6">
        <li>Entre em contato com a loja pelos canais abaixo informando o número do pedido.</li>
        <li>A loja orienta como enviar (ou retirar) o produto.</li>
        <li>Recebido e conferido o produto, o reembolso é feito pela mesma forma de pagamento, nos prazos do serviço de pagamento usado.</li>
      </ol>

      <h2>Pedido ainda não pago</h2>
      <p>Pedidos sem pagamento dentro do prazo são cancelados automaticamente e os produtos voltam à venda. Você também pode cancelar o pedido na página dele enquanto não estiver pago.</p>
    </LegalPage>
  );
}
