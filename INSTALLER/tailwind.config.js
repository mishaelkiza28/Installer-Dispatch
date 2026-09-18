/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#14181C",
        surface: "#1B2127",
        raised: "#232A31",
        border: "#2E363E",
        ink: "#E7EAEC",
        muted: "#93A0AA",
        accent: "#E8A33D",
        "accent-ink": "#171208",
        status: {
          unassigned: "#5B6470",
          dispatched: "#E8A33D",
          acknowledged: "#4FA3D1",
          progress: "#7C86E8",
          completed: "#4CAF7D",
          verified: "#2F8F5E",
          cancelled: "#C1554A",
        },
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        sans: ["'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      keyframes: {
        pulseHighlight: {
          "0%": { boxShadow: "0 0 0 0 rgba(232,163,61,0.55)" },
          "100%": { boxShadow: "0 0 0 8px rgba(232,163,61,0)" },
        },
      },
      animation: {
        "pulse-highlight": "pulseHighlight 900ms ease-out 1",
      },
    },
  },
  plugins: [],
};
