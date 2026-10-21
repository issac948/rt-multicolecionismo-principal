import type { Metadata } from "next";
import Link from "next/link";
import { AddAddressForm, AddressCard, PasswordForm, ProfileForm } from "@/components/shop/account-forms";
import { requireUser } from "@/server/auth/current-user";
import { logoutAction } from "@/server/actions/auth";
import { listAddresses } from "@/server/services/addresses";

export const metadata: Metadata = { title: "Minha conta", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const user = await requireUser("/minha-conta");
  const addresses = await listAddresses(user.id);

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Minha conta</h1>
          <p className="mt-2 text-ink-soft">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/meus-pedidos" className="btn btn-primary">
            Meus pedidos
          </Link>
          {user.role === "ADMIN" && (
            <Link href="/admin/dashboard" className="btn btn-dark">
              Painel da loja
            </Link>
          )}
          <form action={logoutAction}>
            <button type="submit" className="btn btn-outline">
              Sair
            </button>
          </form>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className="panel" aria-labelledby="titulo-dados">
          <h2 id="titulo-dados" className="text-2xl">
            Meus dados
          </h2>
          <div className="mt-4">
            <ProfileForm name={user.name} phone={user.phone} email={user.email} />
          </div>
        </section>

        <section className="panel" aria-labelledby="titulo-senha">
          <h2 id="titulo-senha" className="text-2xl">
            Alterar senha
          </h2>
          <div className="mt-4">
            <PasswordForm />
          </div>
        </section>
      </div>

      <section className="panel mt-6" aria-labelledby="titulo-enderecos">
        <h2 id="titulo-enderecos" className="text-2xl">
          Meus endereços
        </h2>

        {addresses.length > 0 ? (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {addresses.map((address) => (
              <AddressCard
                key={address.id}
                address={{
                  id: address.id,
                  label: address.label,
                  recipientName: address.recipientName,
                  phone: address.phone,
                  cep: address.cep,
                  street: address.street,
                  number: address.number,
                  complement: address.complement,
                  neighborhood: address.neighborhood,
                  city: address.city,
                  state: address.state,
                  isDefault: address.isDefault,
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-ink-soft">Você ainda não cadastrou nenhum endereço.</p>
        )}

        <div className="mt-6 border-t border-line pt-5">
          <h3>Cadastrar novo endereço</h3>
          <div className="mt-4">
            <AddAddressForm defaultName={user.name} defaultPhone={user.phone} first={addresses.length === 0} />
          </div>
        </div>
      </section>
    </div>
  );
}
