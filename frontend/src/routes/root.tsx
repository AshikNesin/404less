import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Card,
  CardContent,
} from "../components/ui/card";

export function Root() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setIsSubmitted(true);
      // In a real app, this would submit to an API
      console.log("Email submitted:", email);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-6 max-w-6xl mx-auto">
        <div className="text-2xl font-bold text-foreground">404less</div>
        <Button variant="outline">
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
          <Button size="lg" className="px-8 py-3 text-lg">
            Start Free Trial
          </Button>
          <Button variant="outline" size="lg" className="px-8 py-3 text-lg">
            View Demo
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          No credit card required • 1 website free • Setup in 30 seconds
        </p>
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
                $9-29/month. No enterprise bloat, no complex features you'll never use.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-foreground mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-center text-muted-foreground mb-16 max-w-2xl mx-auto">
            No enterprise contracts, no surprise bills. Just the features you actually need.
          </p>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <Card className="text-center">
              <h3 className="text-lg font-semibold text-foreground mb-2">Free</h3>
              <div className="text-3xl font-bold text-foreground mb-4">$0</div>
              <ul className="text-muted-foreground space-y-2 mb-6 text-sm">
                <li>1 website</li>
                <li>500 pages monitored</li>
                <li>Daily digest emails</li>
                <li>7-day history</li>
              </ul>
              <Button variant="outline" className="w-full">
                Get Started
              </Button>
            </Card>
            <Card className="text-center border-2 border-primary relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded text-sm">
                Popular
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Starter</h3>
              <div className="text-3xl font-bold text-foreground mb-4">$9<span className="text-lg font-normal">/mo</span></div>
              <ul className="text-muted-foreground space-y-2 mb-6 text-sm">
                <li>3 websites</li>
                <li>5,000 pages monitored</li>
                <li>Instant email alerts</li>
                <li>30-day history</li>
                <li>No branding</li>
              </ul>
              <Button className="w-full">
                Start Free Trial
              </Button>
            </Card>
            <Card className="text-center">
              <h3 className="text-lg font-semibold text-foreground mb-2">Pro</h3>
              <div className="text-3xl font-bold text-foreground mb-4">$29<span className="text-lg font-normal">/mo</span></div>
              <ul className="text-muted-foreground space-y-2 mb-6 text-sm">
                <li>10 websites</li>
                <li>50,000 pages monitored</li>
                <li>Custom notification rules</li>
                <li>Slack integration</li>
                <li>90-day history</li>
              </ul>
              <Button variant="outline" className="w-full">
                Start Free Trial
              </Button>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-6 py-20 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Stop losing visitors to broken links
          </h2>
          <p className="text-xl opacity-90 mb-8">
            Join 50+ others waiting for launch. Get early access and 20% off your first 3 months.
          </p>

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
          <p>© 2025 404less. Building in public.</p>
        </div>
      </footer>
    </div>
  );
}
