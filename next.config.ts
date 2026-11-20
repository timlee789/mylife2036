import type { NextConfig } from 'next';

const config: NextConfig = {
  // PGlite (local development database) ships WebAssembly files and must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default config;
