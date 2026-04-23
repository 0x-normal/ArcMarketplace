/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        arc: {
          dark: "#0a0a1a",
          card: "#12122a",
          border: "#1e1e3a",
          accent: "#e94560",
          blue: "#0f3460",
          purple: "#533483",
          green: "#00d68f",
          yellow: "#ffd93d",
        },
        surface: {
          0: "#060611",
          1: "#0c0c24",
          2: "#10102a",
          3: "#161640",
          4: "#1c1c50",
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        "2xl": "20px",
        "3xl": "24px",
      },
      boxShadow: {
        glow: "0 0 40px rgba(233,69,96,0.08)",
        "glow-lg": "0 0 60px rgba(233,69,96,0.12)",
        card: "0 4px 24px rgba(0,0,0,0.3)",
        elevated: "0 8px 40px rgba(0,0,0,0.4)",
        inner: "inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      animation: {
        "fade-in": "fade-in-up 0.5s ease-out both",
        "scale-in": "scale-in 0.3s ease-out both",
        shimmer: "shimmer 2s infinite",
        float: "float 3s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(233,69,96,0.2)" },
          "50%": { boxShadow: "0 0 20px rgba(233,69,96,0.4)" },
        },
      },
    },
  },
  plugins: [],
};
