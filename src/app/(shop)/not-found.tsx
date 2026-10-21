import type { Metadata } from "next";
import { NotFoundContent } from "@/components/shop/not-found-content";

export const metadata: Metadata = { title: "Página não encontrada", robots: { index: false, follow: false } };

export default function ShopNotFound() {
  return <NotFoundContent />;
}
