import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [react()],
	server: {
		port: 9000,
		host: "0.0.0.0",
		proxy: {
			"/api": {
				target: "http://localhost:9001",
				changeOrigin: true,
			},
		},
		// Configure HMR for network access
		hmr: {
			// Use the same port as the dev server
			port: 9000,
			// Allow connections from any host (needed for network access)
			host: "0.0.0.0",
			// Disable origin check for HMR (needed for network access)
			clientPort: 9000,
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
