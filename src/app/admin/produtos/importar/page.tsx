import type { Metadata } from "next";
import { Download } from "lucide-react";
import { AdminPageHeader, SectionPanel } from "@/components/admin/admin-ui";
import { ProductImportForm } from "@/components/admin/product-import-form";
import { Badge } from "@/components/ui";
import { CSV_COLUMNS, CSV_MAX_ROWS } from "@/lib/product-csv";
import { requireAdminPage } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Importar produtos" };

export default async function ImportProductsPage() {
  await requireAdminPage("/admin/produtos/importar");
  return (
    <>
      <AdminPageHeader
        title="Importar produtos"
        back={{ href: "/admin/produtos", label: "Produtos" }}
        description="Cadastre vários produtos de uma vez a partir de uma planilha. Primeiro você confere a lista; nada é gravado até você confirmar."
        actions={
          <a href="/admin/produtos/importar/modelo" className="btn btn-outline" download>
            <Download size={18} aria-hidden /> Baixar planilha modelo
          </a>
        }
      />
      <div className="space-y-6">
        <SectionPanel title="Como funciona" id="titulo-como">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Baixe a planilha modelo (só os títulos das colunas) e preencha uma linha por produto, no Excel ou Planilhas Google.</li>
            <li>Salve como <strong>CSV</strong> (no Excel: Salvar como &gt; CSV UTF-8). Aceita separação por ponto e vírgula ou vírgula.</li>
            <li>Envie o arquivo aqui e clique em <strong>Conferir planilha</strong>. Cada linha mostra se está pronta ou o que corrigir.</li>
            <li>Se estiver certo, confirme. Os produtos entram como <strong>rascunho</strong>; depois você coloca as fotos e publica.</li>
          </ol>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>Até {CSV_MAX_ROWS} produtos e 1 MB por arquivo. Para mais, divida em arquivos.</li>
            <li>A importação só cria produtos novos. Nome ou SKU que já existe é recusado (para repor estoque, use Estoque).</li>
            <li>As fotos não vêm pela planilha: envie depois, em cada produto.</li>
            <li>Preços e estoques são os da sua planilha, sem nenhum ajuste automático.</li>
          </ul>
        </SectionPanel>

        <SectionPanel title="Colunas da planilha" id="titulo-colunas">
          <div className="table-wrap">
            <table className="table table-cards">
              <caption className="sr-only">Colunas aceitas na planilha</caption>
              <thead>
                <tr>
                  <th scope="col">Coluna</th>
                  <th scope="col">Obrigatória</th>
                  <th scope="col">O que colocar</th>
                </tr>
              </thead>
              <tbody>
                {CSV_COLUMNS.map((c) => (
                  <tr key={c.key}>
                    <td data-primary className="whitespace-nowrap font-mono text-sm">{c.label}</td>
                    <td data-label="Obrigatória">{c.required ? <Badge tone="warning">Sim</Badge> : <span className="text-ink-soft">Não</span>}</td>
                    <td data-label="O que colocar">{c.help}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionPanel>

        <SectionPanel title="Enviar planilha" id="titulo-enviar">
          <ProductImportForm />
        </SectionPanel>
      </div>
    </>
  );
}
