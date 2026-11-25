import type { Metadata } from "next";
import { LegalPage } from "@/components/shop/legal-page";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Regras de uso do site e das compras na loja.",
};

export default async function TermsPage() {
  const settings = await getSettings();
  const store = settings.storeName;
  return (
    <LegalPage title="Termos de uso" updated="novembro de 2026" settings={settings}>
      <p>
        Ao usar o site da <strong>{store}</strong> e fazer compras nele, você concorda com as regras abaixo.
      </p>

      <h2>Cadastro</h2>
      <p>Informe dados verdadeiros e mantenha a senha em segredo. Você é responsável pelas compras feitas na sua conta.</p>

      <h2>Produtos, preços e estoque</h2>
      <ul>
        <li>As peças são, em geral, únicas ou de poucas unidades. O estoque mostrado vale no momento da compra.</li>
        <li>Ao finalizar o pedido, as unidades ficam reservadas para você pelo prazo indicado para pagar. Sem pagamento nesse prazo, o pedido é cancelado e as peças voltam à venda.</li>
        <li>Os preços e promoções valem pelo período indicado e podem mudar sem aviso, mas nunca depois de o pedido ser criado.</li>
        <li>Fotos são ilustrativas do item anunciado; o estado de conservação está descrito em cada anúncio.</li>
      </ul>

      <h2>Cupons de desconto</h2>
      <p>Cada cupom tem regras próprias (validade, valor mínimo e limite de usos). O desconto é conferido ao finalizar o pedido e não é acumulável com outro cupom.</p>

      <h2>Pagamento e entrega</h2>
      <p>
        O pagamento é feito em ambiente seguro de um serviço de pagamento. O pedido só é considerado pago depois da confirmação do serviço. Valor e prazo de entrega aparecem antes de você finalizar. A retirada em mãos, quando disponível, é combinada com a loja.
      </p>

      <h2>Marcas</h2>
      <p>
        Hot Wheels, Mini GT, Matchbox e outras marcas citadas pertencem aos seus respectivos fabricantes. A {store} é uma loja independente, sem vínculo oficial com eles.
      </p>

      <h2>Trocas, devoluções e privacidade</h2>
      <p>
        Veja as páginas <a href="/trocas-e-devolucoes">Trocas e devoluções</a> e <a href="/politica-de-privacidade">Política de privacidade</a>.
      </p>
    </LegalPage>
  );
}
