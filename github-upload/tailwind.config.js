/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: {
          950: "#030511",
          900: "#050816",
          850: "#071024",
          800: "#0b1530",
        },
        starlight: "#dff7ff",
        comet: "#7ddfff",
        aurora: "#9f8cff",
        sakura: "#ff8bcf",
      },
      boxShadow: {
        glow: "0 0 34px rgba(125, 223, 255, 0.22)",
        glass: "0 24px 80px rgba(0, 0, 0, 0.34)",
      },
      fontFamily: {
        sans: [
          "Hiragino Sans",
          "Yu Gothic UI",
          "Yu Gothic",
          "Meiryo",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
