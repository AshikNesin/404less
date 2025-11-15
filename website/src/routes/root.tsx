import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export function Root() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setIsSubmitted(true);
      console.log("Email submitted:", email);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-6 max-w-6xl mx-auto">
        <div className="text-2xl font-bold text-foreground">404less</div>
        <Button variant="outline" onClick={() => window.location.href = 'http://localhost:9000'}>
          Sign In
        </Button>
      </nav>

      {/* Hero Section */}
      <section className="px-6 py-20 max-w-6xl mx-auto text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-6">
          Know about broken links
          <br />
          <span className="text-primary">before your users complain</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
          Real-time 404 monitoring via embeddable widgets. Stop waiting for weekly crawls to discover broken links.
          Get instant alerts when visitors actually encounter 404 errors, not when your next scheduled scan happens to run.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Button size="lg" className="px-8 py-3 text-lg" onClick={() => window.location.href = 'http://localhost:9000'}>
            Start Free Trial
          </Button>
        </div>
        
      </section>

      {/* Features Section */}
      <section className="px-6 py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-foreground mb-16">
            Why real-time beats batch scanning
          </h2>
          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Instant Detection</h3>
              <p className="text-muted-foreground">
                Get notified the moment 404s happen, not days later. No more waiting for scheduled crawls.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">One-Line Setup</h3>
              <p className="text-muted-foreground">
                Paste a single script tag. That's it. No sitemaps, no URL lists, no complex configuration.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Simple & Affordable</h3>
              <p className="text-muted-foreground">
                No complex pricing tiers. Just straightforward monitoring that works.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Coming Soon Section */}
      <section className="px-6 py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Simple, transparent pricing
          </h2>
          <div className="text-6xl font-light text-muted-foreground mb-8">
            Coming soon...
          </div>
          </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-20 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Stop losing visitors to broken links
          </h2>
          {/* <p className="text-xl opacity-90 mb-8">
            Join 50+ others waiting for launch. Get early access and 20% off your first 3 months.
          </p> */}

          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <div className="flex-1">
                <Label htmlFor="email" className="sr-only">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-background text-foreground placeholder-muted-foreground"
                />
              </div>
              <Button type="submit" size="lg" variant="secondary" className="px-6">
                Get Early Access
              </Button>
            </form>
          ) : (
            <div className="bg-secondary/20 backdrop-blur rounded-lg p-6 max-w-md mx-auto">
              <p className="font-medium">
                🎉 Thanks for signing up! We'll notify you when we launch.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-border">
        <div className="max-w-6xl mx-auto text-center text-muted-foreground text-sm">
          <p>© 2025 404less. Nesin Technologies LLP.</p>
        </div>
      </footer>
    </div>
  );
}
