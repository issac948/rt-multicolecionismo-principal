import { Field } from "@/components/ui";
import { BRAZIL_STATES } from "@/lib/constants";

type Defaults = Partial<{
  label: string | null;
  recipientName: string;
  phone: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
}>;

/**
 * Campos de endereço reutilizados na conta e no checkout.
 * `prefix` evita colisão de nomes quando há dois formulários na mesma tela ("addr_" no checkout).
 */
export function AddressFields({
  prefix = "",
  errors = {},
  defaults = {},
  showDefaultCheckbox = false,
}: {
  prefix?: string;
  errors?: Record<string, string>;
  defaults?: Defaults;
  showDefaultCheckbox?: boolean;
}) {
  const id = (name: string) => `${prefix}${name}`;
  const err = (name: string) => errors[id(name)];
  const aria = (name: string) =>
    err(name) ? ({ "aria-invalid": true, "aria-describedby": `${id(name)}-error` } as const) : {};

  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <div className="sm:col-span-3">
        <Field label="Nome de quem recebe" htmlFor={id("recipientName")} error={err("recipientName")}>
          <input
            id={id("recipientName")}
            name={id("recipientName")}
            className="input"
            autoComplete="name"
            maxLength={100}
            defaultValue={defaults.recipientName ?? ""}
            {...aria("recipientName")}
          />
        </Field>
      </div>
      <div className="sm:col-span-3">
        <Field label="Telefone com DDD" htmlFor={id("phone")} error={err("phone")}>
          <input
            id={id("phone")}
            name={id("phone")}
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
            placeholder="(11) 90000-0000"
            defaultValue={defaults.phone ?? ""}
            {...aria("phone")}
          />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Field label="CEP" htmlFor={id("cep")} error={err("cep")}>
          <input
            id={id("cep")}
            name={id("cep")}
            className="input"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={9}
            placeholder="00000-000"
            defaultValue={defaults.cep ?? ""}
            {...aria("cep")}
          />
        </Field>
      </div>
      <div className="sm:col-span-4">
        <Field label="Rua" htmlFor={id("street")} error={err("street")}>
          <input
            id={id("street")}
            name={id("street")}
            className="input"
            autoComplete="address-line1"
            maxLength={150}
            defaultValue={defaults.street ?? ""}
            {...aria("street")}
          />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Field label="Número" htmlFor={id("number")} error={err("number")} hint="Sem número? Use S/N.">
          <input
            id={id("number")}
            name={id("number")}
            className="input"
            maxLength={20}
            defaultValue={defaults.number ?? ""}
            {...aria("number")}
          />
        </Field>
      </div>
      <div className="sm:col-span-4">
        <Field label="Complemento (opcional)" htmlFor={id("complement")} error={err("complement")}>
          <input
            id={id("complement")}
            name={id("complement")}
            className="input"
            autoComplete="address-line2"
            maxLength={100}
            defaultValue={defaults.complement ?? ""}
            {...aria("complement")}
          />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Field label="Bairro" htmlFor={id("neighborhood")} error={err("neighborhood")}>
          <input
            id={id("neighborhood")}
            name={id("neighborhood")}
            className="input"
            maxLength={100}
            defaultValue={defaults.neighborhood ?? ""}
            {...aria("neighborhood")}
          />
        </Field>
      </div>
      <div className="sm:col-span-3">
        <Field label="Cidade" htmlFor={id("city")} error={err("city")}>
          <input
            id={id("city")}
            name={id("city")}
            className="input"
            autoComplete="address-level2"
            maxLength={100}
            defaultValue={defaults.city ?? ""}
            {...aria("city")}
          />
        </Field>
      </div>
      <div className="sm:col-span-1">
        <Field label="Estado" htmlFor={id("state")} error={err("state")}>
          <select
            id={id("state")}
            name={id("state")}
            className="select"
            autoComplete="address-level1"
            defaultValue={defaults.state ?? ""}
            {...aria("state")}
          >
            <option value="">UF</option>
            {BRAZIL_STATES.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="sm:col-span-3">
        <Field label="Apelido do endereço (opcional)" htmlFor={id("label")} error={err("label")} hint="Ex.: Casa, Trabalho">
          <input
            id={id("label")}
            name={id("label")}
            className="input"
            maxLength={40}
            defaultValue={defaults.label ?? ""}
            {...aria("label")}
          />
        </Field>
      </div>

      {showDefaultCheckbox && (
        <label className="flex items-center gap-3 sm:col-span-3 sm:self-end sm:pb-2">
          <input type="checkbox" className="checkbox" name={id("isDefault")} />
          <span>Usar como endereço padrão</span>
        </label>
      )}
    </div>
  );
}
