import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [react()],
	server: {
		port: 9000,
		host: "0.0.0.0",
		strictPort: true,
		proxy: {
			"/api": {
				target: "http://localhost:9001",
				changeOrigin: true,
			},
		},
		// Configure HMR for network access
		hmr: {
			// Show overlay for errors
			overlay: true,
		},
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: "./vitest.setup.ts",
	},
})
