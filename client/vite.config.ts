import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [react()],
	server: {
		port: 9001,
		host: "0.0.0.0",
		strictPort: true,
		// Configure HMR for network access
		hmr: {
			// Show overlay for errors
			overlay: true,
		},
	},
	build: {
		// Build to server's static directory
		outDir: "../server/static",
		emptyOutDir: true,
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: "./vitest.setup.ts",
	},
})
