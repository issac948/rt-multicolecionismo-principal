"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Plus, Trash2, X } from "lucide-react";
import type { ProductFormValues } from "@/components/admin/product-form-values";
import { Alert, Field } from "@/components/ui";
import { PRODUCT_CONDITION_LABEL, PRODUCT_CONDITIONS, SUGGESTED_BRANDS, SUGGESTED_SCALES } from "@/lib/constants";
import { useActionForm } from "@/components/use-action-form";
import { uploadAdminImage } from "@/lib/client-upload";
import { saveProductAction } from "@/server/actions/admin";
import type { FormState } from "@/server/actions/shared";

type CategoryOption = { id: string; name: string; kind?: string };
type UploadedImage = ProductFormValues["images"][number];

const MAX_IMAGES = 12;

function invalid(errors: Record<string, string>, key: string, htmlFor = key) {
  return errors[key] ? ({ "aria-invalid": true, "aria-describedby": `${htmlFor}-error` } as const) : {};
}

/** Contador de caracteres para os campos de SEO (o Google corta títulos e descrições longos). */
function CharCount({ value, max }: { value: string; max: number }) {
  return (
    <span className={value.length > max ? "font-bold text-enamel-deep" : ""} aria-hidden>
      {value.length}/{max}
    </span>
  );
}

/**
 * Formulário único para cadastrar e editar produtos (e para revisar o rascunho da IA).
 * Nada é salvo até o administrador clicar em "Salvar rascunho", "Publicar" ou "Salvar alterações".
 */
export function ProductForm({
  initial,
  categories,
  mode,
}: {
  initial: ProductFormValues;
  categories: CategoryOption[];
  /** "create" mostra estoque inicial e os botões Rascunho/Publicar; "edit" mostra "Salvar alterações". */
  mode: "create" | "edit";
}) {
  const { state, onSubmit, pending } = useActionForm<FormState>(saveProductAction, {});
  const errors = state.errors ?? {};

  const [images, setImages] = useState<UploadedImage[]>(initial.images);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [features, setFeatures] = useState(initial.features.length > 0 ? initial.features : [{ label: "", value: "" }]);
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle);
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription);
  const [shortDescription, setShortDescription] = useState(initial.shortDescription);

  // A seção de colecionável abre sozinha quando a categoria é de colecionáveis ou algum campo dela já está preenchido.
  const hasCollectibleValues = Boolean(initial.brand || initial.model || initial.scale || initial.series || initial.releaseYear || initial.condition || initial.packagingState || initial.conservationNotes);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const selectedKind = categories.find((c) => c.id === categoryId)?.kind ?? "";
  // Categoria de acessórios não mostra os campos de colecionador (a não ser que o produto já os tenha ou o dono peça).
  const [forceCollectible, setForceCollectible] = useState(false);
  const showCollectible = selectedKind !== "OUTROS" || hasCollectibleValues || forceCollectible;
  const isFigure = selectedKind === "COLECIONAVEL";
  const [collectibleOpen, setCollectibleOpen] = useState(hasCollectibleValues || selectedKind === "CARROS" || selectedKind === "COLECIONAVEL");

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);

    const room = MAX_IMAGES - images.length;
    const selected = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > selected.length) setUploadError(`Máximo de ${MAX_IMAGES} fotos por produto.`);

    for (const file of selected) {
      setUploading((n) => n + 1);
      const result = await uploadAdminImage<Partial<UploadedImage>>(file, "product");
      if (!result.ok || !result.data.id || !result.data.url || !result.data.thumbUrl) {
        setUploadError(`${file.name}: ${result.ok ? "não foi possível enviar a foto." : result.error}`);
      } else {
        const saved: UploadedImage = { id: result.data.id, url: result.data.url, thumbUrl: result.data.thumbUrl };
        setImages((current) => [...current, saved]);
      }
      setUploading((n) => n - 1);
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  function moveImage(index: number, delta: -1 | 1) {
    setImages((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const busy = pending || uploading > 0;

  /** Antes de publicar um produto sem foto, pergunta (a loja fica sem imagem). Rascunho não pergunta. */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const form = event.currentTarget;
    const publishing = mode === "create" ? submitter?.value === "publish" : (form.elements.namedItem("active") as HTMLInputElement | null)?.checked === true;
    if (publishing && images.length === 0 && !window.confirm("Este produto está sem foto. Publicar mesmo assim?")) {
      event.preventDefault();
      return;
    }
    onSubmit(event);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {initial.id && <input type="hidden" name="productId" value={initial.id} />}
      {images.map((image) => (
        <input key={image.id} type="hidden" name="imageIds" value={image.id} />
      ))}

      {/* Fotos (primeiro: é o que a pessoa faz primeiro) */}
      <section className="panel space-y-4" aria-labelledby="pf-fotos">
        <h2 id="pf-fotos" className="text-2xl">
          Fotos
        </h2>
        <p className="text-sm text-ink-soft">A primeira foto é a principal. JPG, PNG, WebP ou GIF, máximo {MAX_IMAGES}. As fotos grandes são reduzidas automaticamente antes do envio.</p>

        {images.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((image, index) => (
              <li key={image.id} className="rounded-md border border-line bg-paper p-2">
                <div className="relative aspect-[4/3] overflow-hidden rounded bg-panel">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.thumbUrl} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
                  {index === 0 && <span className="absolute left-1 top-1 badge badge-info">Principal</span>}
                </div>
                <div className="mt-2 flex items-center justify-between gap-1">
                  <button type="button" className="btn btn-outline btn-sm !px-2" onClick={() => moveImage(index, -1)} disabled={index === 0} aria-label={`Mover foto ${index + 1} para trás`}>
                    <ArrowLeft size={16} aria-hidden />
                  </button>
                  <button type="button" className="btn btn-outline btn-sm !px-2" onClick={() => moveImage(index, 1)} disabled={index === images.length - 1} aria-label={`Mover foto ${index + 1} para frente`}>
                    <ArrowRight size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm !px-2"
                    onClick={() => setImages((current) => current.filter((i) => i.id !== image.id))}
                    aria-label={`Remover foto ${index + 1}`}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div>
          <input
            ref={fileInput}
            id="fotos"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="sr-only"
            onChange={(e) => void uploadFiles(e.target.files)}
          />
          <label htmlFor="fotos" className={`btn btn-outline ${images.length >= MAX_IMAGES ? "opacity-50" : "cursor-pointer"}`}>
            <ImagePlus size={18} aria-hidden /> {uploading > 0 ? "Enviando..." : "Adicionar fotos"}
          </label>
          {uploadError && (
            <p className="field-error" role="alert">
              {uploadError}
            </p>
          )}
          {errors.imageIds && <p className="field-error">{errors.imageIds}</p>}
          <p className="hint">As fotos só passam a fazer parte do produto depois que você salvar.</p>
        </div>
      </section>

      {/* O essencial */}
      <section className="panel space-y-4" aria-labelledby="pf-essencial">
        <h2 id="pf-essencial" className="text-2xl">
          O essencial
        </h2>

        <Field label="Nome do produto" htmlFor="name" error={errors.name} hint="Ex.: Miniatura Hot Wheels Camaro 1:64 lacrada">
          <input id="name" name="name" className="input" defaultValue={initial.name} maxLength={120} required {...invalid(errors, "name")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Preço (R$)" htmlFor="price" error={errors.priceCents} hint="Ex.: 29,90">
            <input id="price" name="price" className="input" inputMode="decimal" defaultValue={initial.price} required {...invalid(errors, "priceCents", "price")} />
          </Field>
          {mode === "create" ? (
            <Field label="Quantidade em estoque" htmlFor="stock" error={errors.stock} hint="Quantas unidades você tem.">
              <input id="stock" name="stock" className="input" inputMode="numeric" defaultValue={initial.stock} {...invalid(errors, "stock")} />
            </Field>
          ) : (
            <div>
              <p className="label">Estoque atual</p>
              <p className="flex min-h-11 items-center text-2xl font-extrabold">{initial.stock}</p>
              <p className="hint">
                Para mudar, use <Link href="/admin/estoque">Estoque</Link>: assim fica no histórico.
              </p>
            </div>
          )}
          <Field label="Categoria" htmlFor="categoryId" error={errors.categoryId}>
            <select
              id="categoryId"
              name="categoryId"
              className="select"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                const kind = categories.find((c) => c.id === e.target.value)?.kind;
                if (kind === "CARROS" || kind === "COLECIONAVEL") setCollectibleOpen(true);
              }}
              {...invalid(errors, "categoryId")}
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Preço promocional (R$)" htmlFor="salePrice" error={errors.salePriceCents} hint="Opcional. Menor que o preço.">
            <input id="salePrice" name="salePrice" className="input" inputMode="decimal" defaultValue={initial.salePrice} {...invalid(errors, "salePriceCents", "salePrice")} />
          </Field>
          <Field label="Promoção começa (opcional)" htmlFor="saleStarts" error={errors.saleStartsAt} hint="Horário de Brasília. Vazio = já vale.">
            <input id="saleStarts" name="saleStarts" type="datetime-local" className="input" defaultValue={initial.saleStarts} {...invalid(errors, "saleStartsAt", "saleStarts")} />
          </Field>
          <Field label="Promoção termina (opcional)" htmlFor="saleEnds" error={errors.saleEndsAt} hint="Horário de Brasília. Vazio = sem fim.">
            <input id="saleEnds" name="saleEnds" type="datetime-local" className="input" defaultValue={initial.saleEnds} {...invalid(errors, "saleEndsAt", "saleEnds")} />
          </Field>
        </div>

        <label className="flex items-center gap-3">
          <input type="checkbox" className="checkbox" name="featured" defaultChecked={initial.featured} />
          <span>Mostrar em destaque na página inicial</span>
        </label>
        <p className="hint !mt-0">
          Miniaturas de carros em destaque aparecem na faixa “Destaques” no topo da loja; bonecos e outros colecionáveis aparecem primeiro na vitrine da própria seção.
        </p>
      </section>

      {/* Miniatura / colecionável (tudo opcional) */}
      {showCollectible ? (
      <details
        className="panel"
        open={collectibleOpen}
        onToggle={(e) => setCollectibleOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-2xl font-extrabold [font-stretch:76%]">{isFigure ? "Dados do boneco ou colecionável (opcional)" : "Miniatura ou colecionável (opcional)"}</summary>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-ink-soft">
            Preencha só o que você sabe com certeza e que se aplica a este produto. Nada aqui é obrigatório.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={isFigure ? "Marca ou fabricante" : "Marca"} htmlFor="brand" error={errors.brand} hint={isFigure ? "Ex.: o fabricante do boneco." : "Escolha da lista ou digite outra."}>
              <input id="brand" name="brand" className="input" list={isFigure ? undefined : "pf-marcas"} defaultValue={initial.brand} maxLength={60} autoComplete="off" {...invalid(errors, "brand")} />
              <datalist id="pf-marcas">
                {SUGGESTED_BRANDS.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
            </Field>
            <Field label={isFigure ? "Personagem ou modelo" : "Modelo"} htmlFor="model" error={errors.model} hint={isFigure ? "Nome do personagem ou da figura." : "Ex.: Camaro SS"}>
              <input id="model" name="model" className="input" defaultValue={initial.model} maxLength={120} {...invalid(errors, "model")} />
            </Field>
            <Field label={isFigure ? "Tamanho ou escala" : "Escala"} htmlFor="scale" error={errors.scale} hint={isFigure ? "Ex.: 15 cm ou 1:12." : "Ex.: 1:64 (também aceito 1/64)."}>
              <input id="scale" name="scale" className="input" list={isFigure ? undefined : "pf-escalas"} defaultValue={initial.scale} maxLength={12} autoComplete="off" {...invalid(errors, "scale")} />
              <datalist id="pf-escalas">
                {SUGGESTED_SCALES.map((scale) => (
                  <option key={scale} value={scale} />
                ))}
              </datalist>
            </Field>
            <Field label={isFigure ? "Linha / coleção" : "Série / coleção"} htmlFor="series" error={errors.series}>
              <input id="series" name="series" className="input" defaultValue={initial.series} maxLength={120} {...invalid(errors, "series")} />
            </Field>
            <Field label="Ano" htmlFor="releaseYear" error={errors.releaseYear} hint="Só se tiver certeza.">
              <input id="releaseYear" name="releaseYear" className="input" inputMode="numeric" defaultValue={initial.releaseYear} maxLength={4} {...invalid(errors, "releaseYear")} />
            </Field>
            <Field label="Embalagem" htmlFor="condition" error={errors.condition}>
              <select id="condition" name="condition" className="select" defaultValue={initial.condition} {...invalid(errors, "condition")}>
                <option value="">Não informar</option>
                {PRODUCT_CONDITIONS.map((condition) => (
                  <option key={condition} value={condition}>
                    {PRODUCT_CONDITION_LABEL[condition]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Estado da embalagem" htmlFor="packagingState" error={errors.packagingState} hint="Ex.: caixa com ponta amassada. Seja sincero: o cliente confia na descrição.">
            <input id="packagingState" name="packagingState" className="input" defaultValue={initial.packagingState} maxLength={200} {...invalid(errors, "packagingState")} />
          </Field>
          <Field label="Detalhes de conservação" htmlFor="conservationNotes" error={errors.conservationNotes} hint={isFigure ? "Ex.: articulações firmes, sem marcas de uso." : "Ex.: pintura original, sem riscos, rodas girando."}>
            <textarea id="conservationNotes" name="conservationNotes" className="textarea !min-h-20" rows={2} maxLength={500} defaultValue={initial.conservationNotes} {...invalid(errors, "conservationNotes")} />
          </Field>
        </div>
      </details>
      ) : (
        <p className="text-sm text-ink-soft">
          Categoria de acessórios: os campos de colecionador ficam escondidos.{" "}
          <button type="button" className="btn-link" onClick={() => setForceCollectible(true)}>
            Mostrar campos de colecionador
          </button>
        </p>
      )}

      {/* Atributos: "nome: valor" livres (ex.: altura e articulações de um boneco, o que acompanha a miniatura) */}
      <section className="panel space-y-4" aria-labelledby="pf-caract">
        <h2 id="pf-caract" className="text-2xl">
          Atributos do produto (opcional)
        </h2>
        <p className="text-sm text-ink-soft">
          {isFigure
            ? "Informações em formato “nome: valor”. Ex.: Altura — 15 cm; Articulações — 12 pontos; Acompanha — base e acessórios."
            : "Informações em formato “nome: valor”. Ex.: Cor — vermelho; Acompanha — protetor de acrílico; Detalhe — rodas de borracha."}
        </p>
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <div>
                <label className="label sr-only" htmlFor={`fl-${index}`}>
                  Nome do atributo {index + 1}
                </label>
                <input
                  id={`fl-${index}`}
                  name="featureLabel"
                  className="input"
                  placeholder={isFigure ? "Ex.: Altura" : "Ex.: Acompanha"}
                  maxLength={60}
                  value={feature.label}
                  onChange={(e) => setFeatures((list) => list.map((f, i) => (i === index ? { ...f, label: e.target.value } : f)))}
                />
              </div>
              <div>
                <label className="label sr-only" htmlFor={`fv-${index}`}>
                  Valor do atributo {index + 1}
                </label>
                <input
                  id={`fv-${index}`}
                  name="featureValue"
                  className="input"
                  placeholder={isFigure ? "Ex.: 15 cm" : "Ex.: protetor de acrílico"}
                  maxLength={200}
                  value={feature.value}
                  onChange={(e) => setFeatures((list) => list.map((f, i) => (i === index ? { ...f, value: e.target.value } : f)))}
                />
              </div>
              <button
                type="button"
                className="btn btn-outline !px-3"
                aria-label={`Remover atributo ${index + 1}`}
                onClick={() => setFeatures((list) => (list.length === 1 ? [{ label: "", value: "" }] : list.filter((_, i) => i !== index)))}
              >
                <X size={18} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {errors.features && <p className="field-error">{errors.features}</p>}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setFeatures((list) => [...list, { label: "", value: "" }])} disabled={features.length >= 30}>
          <Plus size={16} aria-hidden /> Adicionar atributo
        </button>

        <Field label="Palavras-chave (tags)" htmlFor="tags" error={errors.tags} hint="Separe com vírgula. Ajudam na busca da loja. Ex.: esportivo, JDM, treasure hunt.">
          <input id="tags" name="tags" className="input" defaultValue={initial.tags} {...invalid(errors, "tags")} />
        </Field>
      </section>

      {/* Descrição */}
      <section className="panel space-y-4" aria-labelledby="pf-descricao">
        <h2 id="pf-descricao" className="text-2xl">
          Descrição
        </h2>
        <Field label="Descrição curta" htmlFor="shortDescription" error={errors.shortDescription} hint="Aparece nas listagens e logo abaixo do nome.">
          <textarea
            id="shortDescription"
            name="shortDescription"
            className="textarea !min-h-20"
            rows={2}
            maxLength={200}
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            {...invalid(errors, "shortDescription")}
          />
          <p className="hint text-right">
            <CharCount value={shortDescription} max={200} />
          </p>
        </Field>
        <Field label="Descrição completa" htmlFor="description" error={errors.description} hint="Separe os parágrafos com uma linha em branco.">
          <textarea id="description" name="description" className="textarea !min-h-40" rows={7} maxLength={5000} defaultValue={initial.description} {...invalid(errors, "description")} />
        </Field>
      </section>

      {/* Mais opções (fechado por padrão) */}
      <details className="panel">
        <summary className="cursor-pointer text-2xl font-extrabold [font-stretch:76%]">Mais opções (código, estoque baixo, peso e medidas, Google)</summary>
        <div className="mt-4 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Código / SKU (opcional)" htmlFor="sku" error={errors.sku} hint="Código interno para você se organizar.">
              <input id="sku" name="sku" className="input" defaultValue={initial.sku} maxLength={60} {...invalid(errors, "sku")} />
            </Field>
            <Field label="Avisar estoque baixo em" htmlFor="lowStockThreshold" error={errors.lowStockThreshold} hint="Unidades.">
              <input id="lowStockThreshold" name="lowStockThreshold" className="input" inputMode="numeric" defaultValue={initial.lowStockThreshold} {...invalid(errors, "lowStockThreshold")} />
            </Field>
          </div>
          <Field label="Frase de promoção (opcional)" htmlFor="promoText" error={errors.promoText} hint="Aparece na página do produto. Ex.: Frete grátis neste mês.">
            <input id="promoText" name="promoText" className="input" defaultValue={initial.promoText} maxLength={200} {...invalid(errors, "promoText")} />
          </Field>
      {/* Medidas */}
      <section className="space-y-4 border-t border-line pt-5" aria-labelledby="pf-medidas">
        <h2 id="pf-medidas" className="text-2xl">
          Peso e medidas (opcional)
        </h2>
        <p className="text-sm text-ink-soft">Usados para calcular frete quando a loja ligar um serviço de entrega com cálculo por peso.</p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Peso (gramas)" htmlFor="weightGrams" error={errors.weightGrams}>
            <input id="weightGrams" name="weightGrams" className="input" inputMode="numeric" defaultValue={initial.weightGrams} {...invalid(errors, "weightGrams")} />
          </Field>
          <Field label="Comprimento (cm)" htmlFor="lengthCm" error={errors.lengthCm}>
            <input id="lengthCm" name="lengthCm" className="input" inputMode="numeric" defaultValue={initial.lengthCm} {...invalid(errors, "lengthCm")} />
          </Field>
          <Field label="Largura (cm)" htmlFor="widthCm" error={errors.widthCm}>
            <input id="widthCm" name="widthCm" className="input" inputMode="numeric" defaultValue={initial.widthCm} {...invalid(errors, "widthCm")} />
          </Field>
          <Field label="Altura (cm)" htmlFor="heightCm" error={errors.heightCm}>
            <input id="heightCm" name="heightCm" className="input" inputMode="numeric" defaultValue={initial.heightCm} {...invalid(errors, "heightCm")} />
          </Field>
        </div>
      </section>

      {/* SEO */}
      <section className="space-y-4 border-t border-line pt-5" aria-labelledby="pf-seo">
        <h2 id="pf-seo" className="text-2xl">
          Aparecer no Google (SEO)
        </h2>
        <p className="text-sm text-ink-soft">Se deixar em branco, a loja usa o nome e a descrição do produto.</p>
        <Field label="Título para o Google" htmlFor="seoTitle" error={errors.seoTitle} hint="Ideal até 60 caracteres.">
          <input id="seoTitle" name="seoTitle" className="input" maxLength={70} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} {...invalid(errors, "seoTitle")} />
          <p className="hint text-right">
            <CharCount value={seoTitle} max={70} />
          </p>
        </Field>
        <Field label="Descrição para o Google" htmlFor="seoDescription" error={errors.seoDescription} hint="Ideal até 155 caracteres.">
          <textarea id="seoDescription" name="seoDescription" className="textarea !min-h-20" rows={2} maxLength={160} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} {...invalid(errors, "seoDescription")} />
          <p className="hint text-right">
            <CharCount value={seoDescription} max={160} />
          </p>
        </Field>
      </section>

        </div>
      </details>

      {/* Barra de ações: fica sempre visível no fim da tela */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {state.message && (
          <Alert tone={state.ok ? "ok" : "error"} className="mb-3">
            {state.message}
          </Alert>
        )}
        <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-3">
          {mode === "create" ? (
            <>
              <button type="submit" name="intent" value="publish" className="btn btn-primary max-sm:!px-3" disabled={busy}>
                {pending ? "Salvando..." : "Publicar na loja"}
              </button>
              <button type="submit" name="intent" value="draft" className="btn btn-outline max-sm:!px-3" disabled={busy}>
                Salvar como rascunho
              </button>
              <button type="submit" name="intent" value="draft-another" className="btn btn-outline max-sm:col-span-2" disabled={busy} title="Salva como rascunho e abre um formulário novo, já com a mesma categoria, marca e escala">
                Salvar rascunho e cadastrar outro
              </button>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2 font-semibold max-sm:col-span-2">
                <input type="checkbox" className="checkbox" name="active" defaultChecked={initial.active} />
                Visível na loja
              </label>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {pending ? "Salvando..." : "Salvar alterações"}
              </button>
            </>
          )}
          {uploading > 0 && <p className="hint !mt-0 max-sm:col-span-2">Aguarde o envio das fotos terminar para salvar.</p>}
        </div>
      </div>
    </form>
  );
}
