interface TechStackProps {
  technologies?: string[];
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
          <img
            src={
              "https://cdn.simpleicons.org/" +
              encodeURIComponent(tech.toLowerCase())
            }
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
