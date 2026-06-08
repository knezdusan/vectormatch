// vitest.setup.ts
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// 1. Mock Next.js Navigation (App Router context)
vi.mock("next/navigation", () => {
  return {
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    }),
    usePathname: () => "/",
    // Next.js 16 dynamic parameters are strictly Promises/Async
    useParams: async () => ({}),
    useSearchParams: () => new URLSearchParams(),
    // Server-side navigation helpers used in Server Actions
    redirect: vi.fn(),
    notFound: vi.fn(),
    permanentRedirect: vi.fn(),
  };
});

// 2. Mock Next.js Server Cache/Headers if you test actions/components calling them
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: async () => new Headers(),
}));
