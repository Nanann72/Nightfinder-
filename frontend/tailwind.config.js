/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
    theme: {
        extend: {
            colors: {
                obsidian: "#050308",
                surface: "#120B15",
                surface2: "#1A1120",
                magenta: {
                    DEFAULT: "#D946EF",
                    50: "#FAE8FF",
                    100: "#F5D0FE",
                    200: "#F5D0FE",
                    300: "#F0ABFC",
                    400: "#E879F9",
                    500: "#D946EF",
                    600: "#C026D3",
                    700: "#A21CAF",
                    800: "#86198F",
                    900: "#701A75",
                },
                border: "hsl(var(--border))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
            },
            fontFamily: {
                display: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', "system-ui", "sans-serif"],
                body: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', "system-ui", "sans-serif"],
                mono: ['"JetBrains Mono"', "monospace"],
            },
            borderRadius: {
                lg: "1rem",
                xl: "1.25rem",
                "2xl": "1.5rem",
            },
            boxShadow: {
                glow: "0 0 30px rgba(217, 70, 239, 0.35)",
                glowStrong: "0 0 60px rgba(217, 70, 239, 0.5)",
            },
            keyframes: {
                "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
                "accordion-up":   { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
                shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
                float:   { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
                fadeUp:  { "0%": { opacity: 0, transform: "translateY(20px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
                shimmerSlide: { "0%": { transform: "translateX(-100%) skewX(-12deg)" }, "100%": { transform: "translateX(400%) skewX(-12deg)" } },
                gradientFlow: { "0%": { backgroundPosition: "0% 50%" }, "100%": { backgroundPosition: "200% 50%" } },
                pulseRing:  { "0%": { transform: "scale(1)", opacity: 0.6 }, "100%": { transform: "scale(2.4)", opacity: 0 } },
                slideInRight: { "0%": { transform: "translateX(100%)", opacity: 0 }, "100%": { transform: "translateX(0)", opacity: 1 } },
                bounceTip: { "0%,100%": { transform: "scale(1)" }, "30%": { transform: "scale(1.15) rotate(-2deg)" }, "60%": { transform: "scale(0.96)" } },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
                shimmer: "shimmer 3s linear infinite",
                float: "float 6s ease-in-out infinite",
                fadeUp: "fadeUp 0.7s ease-out both",
                shimmerSlide: "shimmerSlide 2.4s ease-in-out infinite",
                gradientFlow: "gradientFlow 2s linear infinite",
                pulseRing: "pulseRing 1.6s ease-out infinite",
                slideInRight: "slideInRight 0.35s ease-out both",
                bounceTip: "bounceTip 0.6s ease-out",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
};
