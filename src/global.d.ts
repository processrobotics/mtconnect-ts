// Minimal import.meta.env declaration so tsc can compile providers/ without vite installed
interface ImportMeta {
  readonly env: Record<string, string | undefined>;
}
