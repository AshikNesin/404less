// Card: @groot/ui's Card. `size="lg"` (404less's roomy card) maps to the default size.
import { Card as GrootCard } from "@groot/ui/card";

export {
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@groot/ui/card";

export function Card({
  size,
  ...props
}: Omit<React.ComponentProps<typeof GrootCard>, "size"> & { size?: "sm" | "default" | "lg" }) {
  return <GrootCard size={size === "sm" ? "sm" : "default"} {...props} />;
}
