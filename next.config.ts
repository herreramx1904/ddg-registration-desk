import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs is heavy CommonJS; keep it out of the server bundle (much faster report/import routes).
  serverExternalPackages: ["exceljs"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
