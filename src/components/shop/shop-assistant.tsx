"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { cn, whatsappLink } from "@/lib/text";

type AssistantProduct = { slug: string; name: string; priceText: string; availability: string; href: string; imageUrl: string | null };

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  products?: AssistantProduct[];
  needsHuman?: boolean;
  /** Mensagem de erro (não entra no histórico enviado à IA). */
  failed?: boolean;
};

const MAX_QUESTION_CHARS = 400;
const SUGGESTIONS = ["Quais miniaturas vocês têm?", "Como funciona a entrega?", "Quais formas de pagamento?"];
const INTRO =
  "Oi! Sou o assistente da loja. Posso ajudar a achar miniaturas e tirar dúvidas sobre entrega e pagamento. Sou uma inteligência artificial e posso errar: confira sempre o preço e a disponibilidade nos cartões dos produtos.";

/**
 * Chat de compras no canto da loja. Só é desenhado quando a chave de IA está configurada e o dono deixou ligado.
 * Os preços e o estoque mostrados vêm dos cartões que o servidor monta com dados do banco, nunca do texto da IA.
 */
export function ShopAssistant({ whatsappNumber, stacked }: { whatsappNumber: string; stacked: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Ao fechar pelo teclado ou pelo X o foco volta ao botão do assistente; ao fechar para abrir um produto, o foco segue a navegação.
  const returnFocus = useRef(false);
  function close(restoreFocus = true) {
    returnFocus.current = restoreFocus;
    setOpen(false);
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      launcherRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy, open]);

  // Esc fecha o painel, esteja o foco onde estiver.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function ask(rawQuestion: string) {
    const question = rawQuestion.trim().slice(0, MAX_QUESTION_CHARS);
    if (!question || busy) return;

    const history = messages.filter((m) => !m.failed).map((m) => ({ role: m.role, text: m.text }));
    setMessages((list) => [...list, { id: nextId.current++, role: "user", text: question }]);
    setDraft("");
    setBusy(true);
    try {
      const response = await fetch("/api/assistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        answer?: string;
        products?: AssistantProduct[];
        needsHuman?: boolean;
        error?: string;
      };
      if (!response.ok || !json.answer) {
        setMessages((list) => [
          ...list,
          { id: nextId.current++, role: "assistant", failed: true, needsHuman: true, text: json.error ?? "Não consegui responder agora. Tente de novo ou fale com a loja." },
        ]);
      } else {
        setMessages((list) => [
          ...list,
          { id: nextId.current++, role: "assistant", text: json.answer as string, products: json.products ?? [], needsHuman: json.needsHuman === true },
        ]);
      }
    } catch {
      setMessages((list) => [
        ...list,
        { id: nextId.current++, role: "assistant", failed: true, needsHuman: true, text: "Falha de conexão. Verifique a internet e tente de novo." },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.text ?? "";
  const handoff = whatsappLink(
    whatsappNumber,
    lastQuestion ? `Olá! Vim pelo site e conversei com o assistente. Minha dúvida: ${lastQuestion.slice(0, 300)}` : "Olá! Vim pelo site e gostaria de ajuda.",
  );

  return (
    <>
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls="assistente-painel"
          className={cn(
            "fixed right-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-night px-4 font-bold text-signal shadow-lg ring-2 ring-white hover:bg-night-soft",
            stacked ? "bottom-[5.25rem]" : "bottom-4",
          )}
        >
          <Sparkles size={20} aria-hidden /> Assistente
        </button>
      )}

      {open && (
        <section
          id="assistente-painel"
          role="dialog"
          aria-label="Assistente de compras"
          className="fixed inset-x-3 bottom-3 z-50 flex h-[min(34rem,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:w-[24rem]"
        >
          <header className="on-dark flex items-center justify-between gap-3 bg-night px-4 py-3 text-white">
            <p className="flex items-center gap-2 font-bold">
              <Sparkles size={18} aria-hidden className="text-signal" /> Assistente da loja
            </p>
            <button type="button" onClick={() => close()} aria-label="Fechar o assistente" className="grid h-9 w-9 place-items-center rounded hover:bg-white/10">
              <X size={20} aria-hidden />
            </button>
          </header>

          <div role="log" aria-live="polite" aria-label="Conversa" className="flex-1 space-y-3 overflow-y-auto bg-paper p-3">
            <div className="max-w-[92%] rounded-lg bg-panel p-3 text-sm">{INTRO}</div>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => void ask(suggestion)} className="rounded-full border-2 border-line bg-white px-3 py-1.5 text-sm font-semibold hover:border-ink-soft">
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={cn("flex flex-col gap-2", message.role === "user" ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[92%] whitespace-pre-wrap rounded-lg p-3 text-sm",
                    message.role === "user" ? "bg-night text-white" : message.failed ? "bg-enamel-soft text-ink" : "bg-panel text-ink",
                  )}
                >
                  {message.text}
                </div>

                {message.products && message.products.length > 0 && (
                  <ul className="w-full space-y-2">
                    {message.products.map((product) => (
                      <li key={product.slug}>
                        <Link
                          href={product.href}
                          onClick={() => close(false)}
                          className="flex items-center gap-3 rounded-md border-2 border-line bg-white p-2 text-ink no-underline hover:border-ink-soft"
                        >
                          <span className="h-14 w-14 shrink-0 overflow-hidden rounded bg-panel">
                            {product.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                            )}
                          </span>
                          <span className="min-w-0 text-sm">
                            <strong className="line-clamp-2 block leading-snug">{product.name}</strong>
                            <span className="block text-ink-soft">
                              {product.priceText} · {product.availability}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {message.role === "assistant" && message.needsHuman && handoff && (
                  <a href={handoff} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                    <MessageCircle size={16} aria-hidden /> Falar com a loja no WhatsApp
                  </a>
                )}
              </div>
            ))}

            {busy && (
              <p className="text-sm text-ink-soft" role="status">
                Pensando...
              </p>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={onSubmit} className="flex gap-2 border-t border-line bg-white p-3">
            <label htmlFor="assistente-pergunta" className="sr-only">
              Sua pergunta
            </label>
            <input
              id="assistente-pergunta"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_QUESTION_CHARS}
              autoComplete="off"
              placeholder="Pergunte sobre as miniaturas..."
              className="input min-w-0 flex-1"
            />
            <button type="submit" className="btn btn-primary" disabled={busy || draft.trim() === ""} aria-label="Enviar pergunta">
              <Send size={18} aria-hidden />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
