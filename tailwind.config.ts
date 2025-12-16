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
      fontFamily: {
        sans: ['DM Sans', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['DM Sans', 'system-ui', 'sans-serif'],
      },
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
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        "voice-command-pulse": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.02)" },
          "100%": { transform: "scale(1)" },
        },
        "border-flash": {
          "0%": { opacity: "0", borderWidth: "0px" },
          "30%": { opacity: "1", borderWidth: "8px" },
          "100%": { opacity: "0.8", borderWidth: "8px" },
        },
        "voice-icon-appear": {
          "0%": { opacity: "0", transform: "translate(-50%, -50%) scale(0.5)" },
          "50%": { opacity: "1", transform: "translate(-50%, -50%) scale(1.1)" },
          "100%": { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
        // Confidence betting animations
        "lock-in-bounce": {
          "0%": { transform: "scale(1)" },
          "30%": { transform: "scale(1.08)" },
          "50%": { transform: "scale(0.95)" },
          "70%": { transform: "scale(1.03)" },
          "100%": { transform: "scale(1.02)" },
        },
        "lock-in-fire": {
          "0%": { transform: "scale(1)", filter: "brightness(1)" },
          "20%": { transform: "scale(1.1)", filter: "brightness(1.2)" },
          "40%": { transform: "scale(0.95)", filter: "brightness(1.1)" },
          "60%": { transform: "scale(1.05)", filter: "brightness(1.15)" },
          "100%": { transform: "scale(1.02)", filter: "brightness(1.05)" },
        },
        "lock-in-check": {
          "0%": { transform: "scale(0) rotate(-45deg)", opacity: "0" },
          "50%": { transform: "scale(1.3) rotate(10deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        "xp-particle": {
          "0%": { transform: "scale(0) translateY(0)", opacity: "0" },
          "30%": { transform: "scale(1.2) translateY(-10px)", opacity: "1" },
          "100%": { transform: "scale(0) translateY(-30px)", opacity: "0" },
        },
        "xp-complete": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)" },
        },
        "text-glow-gold": {
          "0%, 100%": { textShadow: "0 0 10px hsl(45 100% 50% / 0.5), 0 0 20px hsl(45 100% 50% / 0.3)" },
          "50%": { textShadow: "0 0 20px hsl(45 100% 50% / 0.7), 0 0 30px hsl(45 100% 50% / 0.5)" },
        },
        "text-glow-fire": {
          "0%, 100%": { textShadow: "0 0 10px hsl(25 100% 50% / 0.6), 0 0 25px hsl(0 100% 50% / 0.4)" },
          "50%": { textShadow: "0 0 25px hsl(25 100% 50% / 0.8), 0 0 40px hsl(0 100% 50% / 0.6)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out forwards",
        "slide-up": "slide-up 0.5s ease-out forwards",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
        "voice-command-pulse": "voice-command-pulse 0.5s ease-out",
        "border-flash": "border-flash 0.5s ease-out forwards",
        "voice-icon-appear": "voice-icon-appear 0.3s ease-out forwards",
        // Confidence betting animations
        "lock-in-bounce": "lock-in-bounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "lock-in-fire": "lock-in-fire 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "lock-in-check": "lock-in-check 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "xp-particle": "xp-particle 0.8s ease-out forwards",
        "xp-complete": "xp-complete 0.4s ease-out",
        "text-glow-gold": "text-glow-gold 1.5s ease-in-out infinite",
        "text-glow-fire": "text-glow-fire 1.2s ease-in-out infinite",
      },
      backgroundImage: {
        "gradient-primary": "var(--gradient-primary)",
        "gradient-secondary": "var(--gradient-secondary)",
        "gradient-achievement": "var(--gradient-achievement)",
        "gradient-energy": "var(--gradient-energy)",
        "gradient-mesh": "var(--gradient-mesh)",
      },
      boxShadow: {
        "sm": "var(--shadow-sm)",
        "md": "var(--shadow-md)",
        "lg": "var(--shadow-lg)",
        "xl": "var(--shadow-xl)",
        "glow": "var(--shadow-glow)",
        "glow-secondary": "var(--shadow-glow-secondary)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
