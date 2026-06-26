import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ['Inter', 'Arial', 'sans-serif'],
  			heading: ['Inter', 'Arial', 'sans-serif'],
  		},
  		colors: {
  			background: 'var(--background)',
  			foreground: 'var(--foreground)',
  			card: {
  				DEFAULT: 'var(--card)',
  				foreground: 'var(--card-foreground)'
  			},
  			popover: {
  				DEFAULT: 'var(--popover)',
  				foreground: 'var(--popover-foreground)'
  			},
  			primary: {
  				DEFAULT: 'var(--primary)',
  				foreground: 'var(--primary-foreground)'
  			},
  			secondary: {
  				DEFAULT: 'var(--secondary)',
  				foreground: 'var(--secondary-foreground)'
  			},
  			muted: {
  				DEFAULT: 'var(--muted)',
  				foreground: 'var(--muted-foreground)'
  			},
  			accent: {
  				DEFAULT: 'var(--accent)',
  				foreground: 'var(--accent-foreground)'
  			},
  			destructive: {
  				DEFAULT: 'var(--destructive)',
  				foreground: 'var(--destructive-foreground)'
  			},
  			border: 'var(--border)',
  			input: 'var(--input)',
  			ring: 'var(--ring)',
  			chart: {
  				'1': 'var(--chart-1)',
  				'2': 'var(--chart-2)',
  				'3': 'var(--chart-3)',
  				'4': 'var(--chart-4)',
  				'5': 'var(--chart-5)'
  			},
  			// Binance Design Tokens
  			binance: {
  				DEFAULT: '#F0B90B',
  				gold: '#FFD000',
  				active: '#D0980B',
  				dark: '#181A20',
  				panel: '#1E2026',
  				card: '#2B2F36',
  				'card-hover': '#363A45',
  			},
  			slate: {
  				text: '#848E9C',
  			},
  			steel: '#5E6673',
  			'crypto-green': '#0ECB81',
  			'crypto-red': '#F6465D',
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			pill: '50px',
  			card: '12px',
  			input: '8px',
  		},
  		boxShadow: {
  			'subtle': 'rgba(0, 0, 0, 0.15) 0px 2px 4px 0px',
  			'card': 'rgba(0, 0, 0, 0.1) 0px 3px 5px 0px',
  			'card-hover': 'rgba(0, 0, 0, 0.2) 0px 4px 8px 0px',
  			'pill': 'rgba(240, 185, 11, 0.15) 0px 2px 10px -3px',
  			'glow': '0 0 20px rgba(240, 185, 11, 0.25)',
  		},
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
