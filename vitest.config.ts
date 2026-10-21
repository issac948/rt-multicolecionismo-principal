import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // Os testes de integração usam um banco PostgreSQL real e compartilhado:
    // arquivos rodam em sequência para não se atropelarem.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgres://loja:loja_dev_pw@localhost:5432/loja_test",
      SITE_URL: "http://localhost:3000",
      UPLOAD_DIR: "./storage/test-uploads",
      NODE_ENV: "test",
      // Os testes antigos de pagamento usam o Mercado Pago simulado; tests/paypal.test.ts troca para PayPal.
      PAYMENT_PROVIDER: "mercadopago",
      PAYPAL_CLIENT_ID: "test-client-id",
      PAYPAL_CLIENT_SECRET: "test-client-secret",
      PAYPAL_WEBHOOK_ID: "WH-TEST",
      MERCADOPAGO_ACCESS_TOKEN: "TEST-access-token",
      MERCADOPAGO_WEBHOOK_SECRET: "test-webhook-secret",
      CRON_SECRET: "test-cron-secret-with-enough-length",
    },
  },
});
