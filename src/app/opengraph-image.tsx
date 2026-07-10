import { ImageResponse } from "next/og";

export const alt = "VectorMatch — The AI Agent for Web Developers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 32% 35%, rgba(126, 58, 242, 0.35) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(192, 38, 211, 0.25) 0%, transparent 50%), #16161e",
        padding: 80,
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #a855f7, #c026d3)",
            fontSize: 32,
            fontWeight: 800,
            color: "#ffffff",
          }}
        >
          V
        </div>
        <span
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#fafafa",
            letterSpacing: "-0.02em",
          }}
        >
          VectorMatch
        </span>
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 64,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: "-0.03em",
          color: "#a855f7",
          maxWidth: 900,
        }}
      >
        The AI Agent for Web Developers
      </div>

      <div
        style={{
          display: "flex",
          marginTop: 24,
          fontSize: 28,
          color: "#a1a1aa",
          maxWidth: 850,
          lineHeight: 1.4,
        }}
      >
        Find hidden tech opportunities, match with your exact skillset, and
        pitch directly to decision makers.
      </div>

      <div
        style={{
          display: "flex",
          marginTop: 48,
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            borderRadius: 999,
            background: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            fontSize: 20,
            color: "#10b981",
            fontWeight: 600,
          }}
        >
          3-Gate AI Matching
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            borderRadius: 999,
            background: "rgba(168, 85, 247, 0.15)",
            border: "1px solid rgba(168, 85, 247, 0.3)",
            fontSize: 20,
            color: "#a855f7",
            fontWeight: 600,
          }}
        >
          Direct Pitching
        </div>
      </div>
    </div>,
    { ...size },
  );
}
