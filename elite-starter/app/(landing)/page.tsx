import HeroSection from "./hero-section";
import FeaturesOne from "./features-one";
import Testimonials from "./testimonials";
import CallToAction from "./call-to-action";
import FAQs from "./faqs";
import Footer from "./footer";
import CustomClerkPricing from "@/components/custom-clerk-pricing";

export default function Home() {
  return (
    <div>
      <HeroSection />
      <FeaturesOne />
      <section className="bg-muted/50 py-16 md:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 mx-auto max-w-2xl space-y-6 text-center">
              <h1 className="text-center text-4xl font-semibold lg:text-5xl">Pricing that Scales with You</h1>
              <p>Gemini is evolving to be more than just the models. It supports an entire to the APIs and platforms helping developers and businesses innovate.</p>
          </div>
          {/* <CustomClerkPricing /> - Commented out until Clerk billing is enabled */}
          <div className="text-center p-8 border rounded-lg bg-background">
            <h3 className="text-xl font-semibold mb-4">KprCli Pricing</h3>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="p-4 border rounded">
                <h4 className="font-semibold">Solo</h4>
                <p className="text-2xl font-bold">Free</p>
                <p className="text-sm text-muted-foreground">Basic form automation</p>
              </div>
              <div className="p-4 border rounded bg-primary/5">
                <h4 className="font-semibold">Pair</h4>
                <p className="text-2xl font-bold">$19/mo</p>
                <p className="text-sm text-muted-foreground">Enhanced AI models</p>
              </div>
              <div className="p-4 border rounded">
                <h4 className="font-semibold">Squad</h4>
                <p className="text-2xl font-bold">$49/mo</p>
                <p className="text-sm text-muted-foreground">Telegram bot + team features</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <Testimonials />
      <CallToAction />
      <FAQs />
      <Footer />
    </div>
  );
}
