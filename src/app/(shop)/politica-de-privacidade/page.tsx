import type { Metadata } from "next";
import { LegalPage } from "@/components/shop/legal-page";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Quais dados a loja coleta, para que usa e como você exerce seus direitos (LGPD).",
};

export default async function PrivacyPage() {
  const settings = await getSettings();
  const store = settings.storeName;
  return (
    <LegalPage title="Política de privacidade" updated="novembro de 2026" settings={settings}>
      <p>
        Esta página explica como a loja <strong>{store}</strong> trata os seus dados pessoais, de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).
      </p>

      <h2>Quais dados coletamos</h2>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail, telefone e senha (a senha nunca é guardada em texto: fica só um código irreversível, o &quot;hash&quot;, que nem a loja consegue ler).
        </li>
        <li>
          <strong>Entrega:</strong> nome de quem recebe, telefone, CEP e endereço.
        </li>
        <li>
          <strong>Pedidos:</strong> produtos comprados, valores, forma de entrega, situação do pagamento e observações que você escrever.
        </li>
        <li>
          <strong>Carrinho e navegação:</strong> um cookie próprio mantém o seu carrinho (e a sua sessão, se você entrar na conta). Não usamos cookies de publicidade.
        </li>
      </ul>

      <h2>Para que usamos</h2>
      <ul>
        <li>Criar a sua conta e identificar você quando entra.</li>
        <li>Processar o pedido, o pagamento, a entrega e o atendimento (inclusive trocas e devoluções).</li>
        <li>Avisar você sobre o andamento do pedido.</li>
        <li>Cumprir obrigações legais e proteger a loja contra fraudes e abusos.</li>
      </ul>
      <p>Não vendemos os seus dados.</p>

      <h2>Com quem compartilhamos</h2>
      <p>Só o necessário para a compra acontecer:</p>
      <ul>
        <li>
          <strong>Serviço de pagamento</strong> (o que aparece no checkout: por exemplo Mercado Pago, PayPal ou InfinitePay): recebe os dados do pedido e do pagador. Os dados do cartão são digitados no ambiente do serviço de pagamento e não passam pela loja.
        </li>
        <li>
          <strong>Transportadoras e serviço de frete</strong> (como o SuperFrete e os Correios): recebem nome, telefone e endereço de entrega para calcular e fazer a entrega.
        </li>
        <li>
          <strong>Hospedagem e banco de dados</strong> (Netlify e Neon): guardam as informações do site com segurança, em nome da loja.
        </li>
        <li>
          <strong>Consulta de CEP</strong> (ViaCEP): ao digitar o CEP no cadastro de endereço, só o número do CEP é enviado a esse serviço público para preencher rua, bairro e cidade.
        </li>
        <li>
          <strong>Assistente de compras com IA</strong> (quando estiver ativado): o texto que você digita no assistente é enviado ao serviço de IA para gerar a resposta. Não escreva dados pessoais nele.
        </li>
      </ul>

      <h2>Por quanto tempo guardamos</h2>
      <p>
        Enquanto a sua conta existir e pelo tempo exigido por lei para registros de venda (por exemplo, obrigações fiscais e de defesa do consumidor). Depois disso, os dados são apagados ou anonimizados.
      </p>

      <h2>Seus direitos</h2>
      <p>Você pode, a qualquer momento, pedir à loja:</p>
      <ul>
        <li>confirmação de que tratamos seus dados e acesso a eles;</li>
        <li>correção de dados incompletos ou desatualizados;</li>
        <li>exclusão ou anonimização de dados desnecessários (respeitados os prazos legais de guarda);</li>
        <li>informações sobre com quem os dados foram compartilhados;</li>
        <li>revogação de consentimento, quando for o caso.</li>
      </ul>
      <p>Você também pode editar o seu cadastro e os seus endereços na área “Minha conta”.</p>
    </LegalPage>
  );
}
