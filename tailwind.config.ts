import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          glow: "hsl(var(--primary-glow))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
          glow: "hsl(var(--secondary-glow))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Gamification colors
        achievement: {
          DEFAULT: "hsl(var(--achievement))",
          foreground: "hsl(var(--achievement-foreground))",
          glow: "hsl(var(--achievement-glow))",
        },
        energy: {
          DEFAULT: "hsl(var(--energy))",
          foreground: "hsl(var(--energy-foreground))",
          glow: "hsl(var(--energy-glow))",
        },
        streak: "hsl(var(--streak-fire))",
        coins: "hsl(var(--coins))",
        health: "hsl(var(--health))",
        "level-up": "hsl(var(--level-up))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "level-up": "level-up 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        "coin-bounce": "coin-bounce 0.8s ease-in-out",
        "streak-fire": "streak-fire 1.5s ease-in-out infinite",
        "slide-up": "retro-slide-up 0.4s ease-out",
      },
      backgroundImage: {
        "gradient-primary": "var(--gradient-primary)",
        "gradient-secondary": "var(--gradient-secondary)",
        "gradient-achievement": "var(--gradient-achievement)",
        "gradient-energy": "var(--gradient-energy)",
        "gradient-rainbow": "var(--gradient-rainbow)",
      },
      boxShadow: {
        "retro": "var(--shadow-retro)",
        "achievement": "var(--shadow-achievement)",
        "glow": "var(--shadow-glow)",
        "neon": "var(--shadow-neon)",
      },
      transitionTimingFunction: {
        "bounce": "var(--transition-bounce)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
