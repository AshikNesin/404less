import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { Root } from "./routes/root"

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<Root />
	</StrictMode>,
)
