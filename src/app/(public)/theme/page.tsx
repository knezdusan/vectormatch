"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const lightColors = {
  background: "oklch(0.9842 0.0034 247.8575)",
  foreground: "oklch(0.2795 0.0368 260.031)",
  card: "oklch(1 0 0)",
  "card-foreground": "oklch(0.2795 0.0368 260.031)",
  popover: "oklch(1 0 0)",
  "popover-foreground": "oklch(0.2795 0.0368 260.031)",
  primary: "oklch(0.5854 0.2041 277.1173)",
  "primary-foreground": "oklch(1 0 0)",
  secondary: "oklch(0.9276 0.0058 264.5313)",
  "secondary-foreground": "oklch(0.3729 0.0306 259.7328)",
  muted: "oklch(0.967 0.0029 264.5419)",
  "muted-foreground": "oklch(0.551 0.0234 264.3637)",
  accent: "oklch(0.9299 0.0334 272.7879)",
  "accent-foreground": "oklch(0.3729 0.0306 259.7328)",
  destructive: "oklch(0.6368 0.2078 25.3313)",
  "destructive-foreground": "oklch(1 0 0)",
  border: "oklch(0.8717 0.0093 258.3382)",
  input: "oklch(0.8717 0.0093 258.3382)",
  ring: "oklch(0.5854 0.2041 277.1173)",
  "chart-1": "oklch(0.5854 0.2041 277.1173)",
  "chart-2": "oklch(0.5106 0.2301 276.9656)",
  "chart-3": "oklch(0.4568 0.2146 277.0229)",
  "chart-4": "oklch(0.3984 0.1773 277.3662)",
  "chart-5": "oklch(0.3588 0.1354 278.6973)",
  sidebar: "oklch(0.967 0.0029 264.5419)",
  "sidebar-foreground": "oklch(0.2795 0.0368 260.031)",
  "sidebar-primary": "oklch(0.5854 0.2041 277.1173)",
  "sidebar-primary-foreground": "oklch(1 0 0)",
  "sidebar-accent": "oklch(0.9299 0.0334 272.7879)",
  "sidebar-accent-foreground": "oklch(0.3729 0.0306 259.7328)",
  "sidebar-border": "oklch(0.8717 0.0093 258.3382)",
  "sidebar-ring": "oklch(0.5854 0.2041 277.1173)",
};

const darkColors = {
  background: "oklch(0.2077 0.0398 265.7549)",
  foreground: "oklch(0.9288 0.0126 255.5078)",
  card: "oklch(0.2795 0.0368 260.031)",
  "card-foreground": "oklch(0.9288 0.0126 255.5078)",
  popover: "oklch(0.2795 0.0368 260.031)",
  "popover-foreground": "oklch(0.9288 0.0126 255.5078)",
  primary: "oklch(0.6801 0.1583 276.9349)",
  "primary-foreground": "oklch(0.2077 0.0398 265.7549)",
  secondary: "oklch(0.3351 0.0331 260.912)",
  "secondary-foreground": "oklch(0.8717 0.0093 258.3382)",
  muted: "oklch(0.2427 0.0381 259.9437)",
  "muted-foreground": "oklch(0.7137 0.0192 261.3246)",
  accent: "oklch(0.3729 0.0306 259.7328)",
  "accent-foreground": "oklch(0.8717 0.0093 258.3382)",
  destructive: "oklch(0.6368 0.2078 25.3313)",
  "destructive-foreground": "oklch(0.2077 0.0398 265.7549)",
  border: "oklch(0.4461 0.0263 256.8018)",
  input: "oklch(0.4461 0.0263 256.8018)",
  ring: "oklch(0.6801 0.1583 276.9349)",
  "chart-1": "oklch(0.6801 0.1583 276.9349)",
  "chart-2": "oklch(0.5854 0.2041 277.1173)",
  "chart-3": "oklch(0.5106 0.2301 276.9656)",
  "chart-4": "oklch(0.4568 0.2146 277.0229)",
  "chart-5": "oklch(0.3984 0.1773 277.3662)",
  sidebar: "oklch(0.2795 0.0368 260.031)",
  "sidebar-foreground": "oklch(0.9288 0.0126 255.5078)",
  "sidebar-primary": "oklch(0.6801 0.1583 276.9349)",
  "sidebar-primary-foreground": "oklch(0.2077 0.0398 265.7549)",
  "sidebar-accent": "oklch(0.3729 0.0306 259.7328)",
  "sidebar-accent-foreground": "oklch(0.8717 0.0093 258.3382)",
  "sidebar-border": "oklch(0.4461 0.0263 256.8018)",
  "sidebar-ring": "oklch(0.6801 0.1583 276.9349)",
};

const keyPriority = [
  "primary",
  "background",
  "foreground",
  "secondary",
  "accent",
  "muted",
  "card",
  "popover",
  "border",
  "input",
  "ring",
  "destructive",
];

function getBestKey(color: string, colors: Record<string, string>): string {
  const keys = Object.entries(colors)
    .filter(([_, val]) => val === color)
    .map(([key]) => key);

  let bestKey = keys[0];
  let bestIndex = Infinity;

  for (const key of keys) {
    const idx = keyPriority.indexOf(key);
    if (idx !== -1 && idx < bestIndex) {
      bestIndex = idx;
      bestKey = key;
    }
  }
  return bestKey;
}

function ColorSection({
  title,
  colors,
}: {
  title: string;
  colors: Record<string, string>;
}) {
  const categories = {
    Base: [
      "background",
      "foreground",
      "card",
      "card-foreground",
      "popover",
      "popover-foreground",
    ],
    Primary: ["primary", "primary-foreground"],
    Secondary: ["secondary", "secondary-foreground"],
    Muted: ["muted", "muted-foreground"],
    Accent: ["accent", "accent-foreground"],
    Destructive: ["destructive", "destructive-foreground"],
    Borders: ["border", "input", "ring"],
    Charts: ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"],
    Sidebar: [
      "sidebar",
      "sidebar-foreground",
      "sidebar-primary",
      "sidebar-primary-foreground",
      "sidebar-accent",
      "sidebar-accent-foreground",
      "sidebar-border",
      "sidebar-ring",
    ],
  };

  const uniqueColors = Array.from(new Set(Object.values(colors)));

  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold mb-6">{title}</h2>
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-3 text-muted-foreground">
          Color Palette
        </h3>
        <TooltipProvider>
          <div className="flex flex-wrap gap-2">
            {uniqueColors.map((color) => {
              const bestKey = getBestKey(color, colors);
              return (
                <Tooltip key={color}>
                  <TooltipTrigger asChild>
                    <div
                      className="border rounded overflow-hidden cursor-help"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div
                        className="h-8 w-12"
                        style={{ backgroundColor: color }}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-0.5">
                      <p className="font-semibold text-xs capitalize">
                        {bestKey}
                      </p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {color}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </div>
      {Object.entries(categories).map(([category, colorKeys]) => (
        <div key={category} className="mb-8">
          <h3 className="text-xl font-semibold mb-4 text-muted-foreground">
            {category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {colorKeys.map((key) => {
              const color = colors[key];
              if (!color) return null;
              return (
                <div
                  key={key}
                  className="border rounded-lg overflow-hidden"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div
                    className="h-24 w-full"
                    style={{ backgroundColor: color }}
                  />
                  <div className="p-3 bg-card">
                    <p className="font-medium text-sm">{key}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      {color}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ThemePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-7xl mx-auto px-8 py-6">
          <h1 className="text-4xl font-bold">Theme Colors</h1>
          <p className="text-muted-foreground mt-2">
            All color variables for light and dark modes
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto">
        <div
          className="bg-card border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <ColorSection title="Dark Mode" colors={darkColors} />
        </div>
        <div className="dark bg-card">
          <ColorSection title="Light Mode" colors={lightColors} />
        </div>
      </div>
    </div>
  );
}
