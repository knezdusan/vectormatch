interface TechStackProps {
  technologies?: string[];
}

// Display names rarely match Simple Icons slugs. Map the common mismatches;
// everything else falls back to a normalized slug (lowercase, alphanumerics only).
const ICON_SLUGS: Record<string, string> = {
  "next.js": "nextdotjs",
  nextjs: "nextdotjs",
  "node.js": "nodedotjs",
  nodejs: "nodedotjs",
  "vue.js": "vuedotjs",
  vuejs: "vuedotjs",
  "nuxt.js": "nuxtdotjs",
  nuxtjs: "nuxtdotjs",
  tailwind: "tailwindcss",
  "tailwind css": "tailwindcss",
  "c#": "csharp",
  "c++": "cplusplus",
  golang: "go",
};

function iconSlug(name: string): string {
  const key = name.toLowerCase().trim();
  return ICON_SLUGS[key] ?? key.replace(/[^a-z0-9]/g, "");
}

export function TechStack({ technologies = [] }: TechStackProps) {
  if (!technologies.length) return null;

  return (
    <div className="my-6 flex flex-wrap gap-3">
      {technologies.map((tech) => (
        <div
          key={tech}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-primary/30"
        >
          {/* biome-ignore lint/performance/noImgElement: remote Simple Icons SVGs gain nothing from next/image and avoid enabling dangerouslyAllowSVG globally */}
          <img
            src={`https://cdn.simpleicons.org/${iconSlug(tech)}`}
            alt={tech}
            width={20}
            height={20}
            loading="lazy"
            className="size-5 shrink-0"
          />
          <span className="text-xs font-medium text-foreground">{tech}</span>
        </div>
      ))}
    </div>
  );
}
