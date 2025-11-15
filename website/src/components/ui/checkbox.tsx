import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"
import { forwardRef } from "react"
import type { ComponentPropsWithoutRef, ElementRef } from "react"

import { cn } from "../../lib/utils"

export const Checkbox = forwardRef<
	ElementRef<typeof CheckboxPrimitive.Root>,
	ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
	<CheckboxPrimitive.Root
		ref={ref}
		className={cn(
			"peer h-4 w-4 shrink-0 rounded-md border border-input ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
			className,
		)}
		{...props}
	>
		<CheckboxPrimitive.Indicator className="flex items-center justify-center text-primary-foreground">
			<CheckIcon className="h-3 w-3" />
		</CheckboxPrimitive.Indicator>
	</CheckboxPrimitive.Root>
))

Checkbox.displayName = CheckboxPrimitive.Root.displayName
