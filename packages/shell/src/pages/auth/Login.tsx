import { useNavigate } from "react-router-dom";
import { Button } from "@groot/ui/button";
import { displayClass, h1Class } from "@groot/ui/typography";
import { Input } from "@groot/ui/input";
import { Form, FormField } from "@groot/ui/form";
import { loginErrorDescription, useAuthStore } from "@groot/shell/store/auth";
import { type LoginFeature, useShellConfig } from "@groot/shell/lib/shell-config";
import { z } from "zod";
import { toast } from "sonner";
import { LayoutDashboard, ShieldCheck, Zap, ArrowRight, KeyRound } from "lucide-react";

const isDev = import.meta.env.DEV;

const DEMO_CREDENTIALS = { email: "demo@example.com", password: "demo@example.com" }; // gitleaks:allow (dev-only demo account)

// Mirrors the server's loginSchema (packages/core/src/auth/auth.schema.ts),
// duplicated so the client bundle never imports the server package.
const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});
type LoginValues = z.infer<typeof loginSchema>;

export { loginErrorDescription };

const FEATURES = [
  {
    icon: Zap,
    title: "Built for speed",
    desc: "Hono on Node or Workers, React with HMR out of the box.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by default",
    desc: "Cookie sessions, passkeys, and rate-limited sign-in.",
  },
  { icon: LayoutDashboard, title: "Production UI", desc: "A polished sidebar shell you can ship." },
] satisfies LoginFeature[];

export function Login() {
  const login = useAuthStore((state) => state.login);
  const loginWithPasskey = useAuthStore((state) => state.loginWithPasskey);
  const navigate = useNavigate();
  const config = useShellConfig();
  const { icon: BrandMark, label: brandLabel } = config.brand;
  const tagline = config.login?.tagline ?? "The boilerplate that ships like a product.";
  const description =
    config.login?.description ??
    "Everything you need to launch a full-stack SaaS (auth, storage, background jobs, and a polished UI) without the busywork.";
  const features = config.login?.features ?? FEATURES;

  const onSubmit = async (values: LoginValues) => {
    try {
      await login(values.email, values.password);
      navigate("/");
    } catch (error) {
      toast.error("Login Failed", {
        description: loginErrorDescription(error, "Invalid credentials"),
      });
    }
  };

  const handlePasskeyLogin = async () => {
    try {
      await loginWithPasskey();
      navigate("/");
    } catch (error) {
      toast.error("Passkey Sign-In Failed", {
        description: loginErrorDescription(error, "Passkey authentication failed"),
      });
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left: form. */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <BrandMark className="size-5" />
            </span>
            <span className="font-heading text-base font-semibold">{brandLabel}</span>
          </div>

          <h1 className={h1Class}>Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your account to continue.</p>

          {isDev && (
            <div className="mt-6 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Demo credentials:</span>
              demo@example.com / demo@example.com
            </div>
          )}

          <Form
            schema={loginSchema}
            defaultValues={isDev ? DEMO_CREDENTIALS : { email: "", password: "" }}
            onSubmit={onSubmit}
            className="mt-6 space-y-4"
          >
            <FormField name="email" label="Email">
              <Input type="email" autoComplete="username" placeholder="you@example.com" />
            </FormField>
            <FormField name="password" label="Password">
              <Input type="password" autoComplete="current-password" placeholder="••••••••" />
            </FormField>
            <Button type="submit" size="lg" className="w-full">
              Sign In
              <ArrowRight className="size-4" />
            </Button>
          </Form>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={handlePasskeyLogin}
          >
            <KeyRound className="size-4" />
            Sign in with passkey
          </Button>
        </div>
      </div>

      {/* Right: brand panel. */}
      <div className="bg-primary dark:bg-card relative hidden overflow-hidden lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:px-16">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="text-primary-foreground dark:text-foreground relative max-w-md">
          <h2 className={displayClass}>{tagline}</h2>
          <p className="text-primary-foreground/70 dark:text-foreground/70 mt-3 text-sm">
            {description}
          </p>
          <ul className="mt-8 space-y-4">
            {features.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/10 dark:bg-foreground/10">
                  <f.icon className="size-4 text-primary-foreground dark:text-foreground" />
                </span>
                <div>
                  <p className="text-primary-foreground dark:text-foreground text-sm font-medium">
                    {f.title}
                  </p>
                  <p className="text-primary-foreground/60 dark:text-foreground/60 text-sm">
                    {f.desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
