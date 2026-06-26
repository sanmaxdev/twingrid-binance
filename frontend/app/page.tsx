"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Bot, ShieldCheck, TrendingUp, Lock, CheckCircle2, Star, Percent, LineChart, Rocket, ChevronDown, Zap, Crown, Sparkles, BarChart2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = 7;
  const isAnimating = useRef(false);
  const touchStartY = useRef(0);
  
  // Pagination Dots Auto-Hide
  const [dotsVisible, setDotsVisible] = useState(true);
  const dotsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rotating Texts for Hero
  const rotatingTexts = ["Precision.", "AI Power.", "Smart DCA.", "Trend Following."];
  const [textIndex, setTextIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % rotatingTexts.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const [featurePage, setFeaturePage] = useState(0);
  const [activeFlowStep, setActiveFlowStep] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    { question: "Do I need to transfer my funds to your platform?", answer: "No. Your funds never leave your Binance account. Twin Grid connects via API using strictly 'Read' and 'Trade' permissions. Withdrawals are impossible through our platform." },
    { question: "How does the subscription pricing work?", answer: "We offer three tiers: Free (1 account, 25% profit share), Pro at $10/month (5 accounts, 20% profit share, Backtest Engine), and Elite at $20/month (unlimited accounts, 15% profit share, AI Strategy Builder). Subscription fees are deducted from your TwinGrid Fee Wallet monthly." },
    { question: "What happens if my wallet runs out during renewal?", answer: "We offer a 3-day grace period before downgrading. You'll retain full access while we retry the charge. Top up your wallet within 3 days to keep your plan — otherwise you'll revert to the Free tier." },
    { question: "What happens during extreme market volatility?", answer: "Our State Healing engine constantly reconciles your local grid with the Binance order book. If the exchange lags, our microservices pause entries and resume perfectly once stable." }
  ];

  const flowSteps = [
    { step: "01", title: "API Link", desc: "Secure connection via encrypted keys. Read and trade permissions only." },
    { step: "02", title: "Logic Setup", desc: "Define take-profits, safety orders, and volume scales." },
    { step: "03", title: "AI Analyze", desc: "Trend matrix filters process multi-timeframe market data." },
    { step: "04", title: "Execution", desc: "Bots run 24/7 on microservices for zero-latency trading." }
  ];

  const features = [
    { icon: Bot, title: "Dynamic DCA", desc: "Scale positions with intelligent step multipliers and volume scales." },
    { icon: TrendingUp, title: "AI Trend Matrix", desc: "Multi-timeframe EMA filters prevent counter-trend entries." },
    { icon: LineChart, title: "Real-time Analytics", desc: "Monitor active bots, closed trades, and portfolio growth instantly." },
    { icon: Rocket, title: "Trailing Take-Profit", desc: "Maximize your gains during huge pumps by letting winning trades ride." },
    { icon: ShieldCheck, title: "AES-256", desc: "Military-grade encryption for all exchange API credentials." },
    { icon: Lock, title: "State Healing", desc: "Auto-reconciliation ensures local database matches Binance state." },
  ];

  const testimonials = [
    { name: "Alex K.", role: "Pro Trader", text: "The DCA engine here is unmatched. It saved my portfolio during the last flash crash. Truly institutional grade." },
    { name: "Sarah J.", role: "Fund Manager", text: "Finally, a platform that doesn't feel like a toy. The AI trend filters keep us on the right side of the market." },
    { name: "Michael T.", role: "Quant Analyst", text: "The trailing take-profit feature is incredible. During the last bull run, my bots captured significantly more profit than standard grids." },
    { name: "Elena R.", role: "Retail Investor", text: "Incredibly intuitive. I securely connected my Binance API and had my first automated bot running in 5 minutes." },
    { name: "David W.", role: "Day Trader", text: "The state healing feature is a lifesaver. It automatically reconciles with Binance so my grids are never out of sync." },
    { name: "Chris P.", role: "Algo Trader", text: "Zero latency execution. The dedicated microservices architecture handles high-frequency grid updates flawlessly." },
    { name: "Amanda L.", role: "Swing Trader", text: "I've tried every bot platform out there. Twin Grid is the only one that handles extreme volatility without hanging." },
    { name: "James C.", role: "Portfolio Manager", text: "The security architecture gives me peace of mind. AES-256 encryption for API keys is an absolute requirement for us." },
    { name: "Robert F.", role: "Crypto Enthusiast", text: "The UI is beautiful and dark. It looks exactly like a professional trading terminal should look. No distractions." },
    { name: "Lisa M.", role: "Technical Analyst", text: "The multi-timeframe EMA filters are pure magic. My bots almost never buy the top of a fake breakout anymore." },
    { name: "Kevin B.", role: "Full-time Trader", text: "Customer support actually understands algorithmic trading. They helped me debug my custom grid spacing logic." },
    { name: "Nina S.", role: "DeFi Researcher", text: "For anyone serious about automating Binance Futures, this is the gold standard. The execution speed is unreal." }
  ];

  // Responsive Testimonial Pagination
  const [testiPage, setTestiPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(3);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const handleResize = () => {
      const newItems = window.innerWidth < 768 ? 1 : 3;
      if (newItems !== itemsPerPage) {
        setItemsPerPage(newItems);
        setTestiPage(0); // Reset page to avoid out-of-bounds
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [itemsPerPage]);

  const totalTestiPages = Math.ceil(testimonials.length / itemsPerPage);

  useEffect(() => {
    if (currentSlide === 1) {
      const interval = setInterval(() => {
        setActiveFlowStep((prev) => (prev + 1) % 4);
      }, 1500);
      return () => clearInterval(interval);
    } else {
      setActiveFlowStep(0);
    }
  }, [currentSlide]);

  useEffect(() => {
    if (currentSlide === 2) {
      const interval = setInterval(() => {
        if (window.innerWidth < 768) {
          setFeaturePage((prev) => (prev === 0 ? 1 : 0));
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [currentSlide]);

  useEffect(() => {
    if (currentSlide === 3) {
      const interval = setInterval(() => {
        setTestiPage((prev) => (prev + 1) % totalTestiPages);
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [currentSlide, totalTestiPages]);

  // Viewport Swapping Logic
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (isAnimating.current) return;
      if (e.deltaY > 40) {
        if (currentSlide < totalSlides - 1) {
          isAnimating.current = true;
          setCurrentSlide((p) => p + 1);
          setTimeout(() => (isAnimating.current = false), 1000);
        }
      } else if (e.deltaY < -40) {
        if (currentSlide > 0) {
          isAnimating.current = true;
          setCurrentSlide((p) => p - 1);
          setTimeout(() => (isAnimating.current = false), 1000);
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isAnimating.current) return;
      const touchEndY = e.changedTouches[0].clientY;
      const diff = touchStartY.current - touchEndY;
      if (diff > 40) {
        if (currentSlide < totalSlides - 1) {
          isAnimating.current = true;
          setCurrentSlide((p) => p + 1);
          setTimeout(() => (isAnimating.current = false), 1000);
        }
      } else if (diff < -40) {
        if (currentSlide > 0) {
          isAnimating.current = true;
          setCurrentSlide((p) => p - 1);
          setTimeout(() => (isAnimating.current = false), 1000);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", "Space"].includes(e.code)) {
        e.preventDefault();
        if (!isAnimating.current && currentSlide < totalSlides - 1) {
          isAnimating.current = true;
          setCurrentSlide(p => p + 1);
          setTimeout(() => (isAnimating.current = false), 1000);
        }
      }
      if (["ArrowUp", "PageUp"].includes(e.code)) {
        e.preventDefault();
        if (!isAnimating.current && currentSlide > 0) {
          isAnimating.current = true;
          setCurrentSlide(p => p - 1);
          setTimeout(() => (isAnimating.current = false), 1000);
        }
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentSlide, totalSlides]);

  // Handle Pagination Dots Auto-Hide
  useEffect(() => {
    setDotsVisible(true);
    if (dotsTimeoutRef.current) clearTimeout(dotsTimeoutRef.current);
    dotsTimeoutRef.current = setTimeout(() => {
      setDotsVisible(false);
    }, 2000);

    return () => {
      if (dotsTimeoutRef.current) clearTimeout(dotsTimeoutRef.current);
    };
  }, [currentSlide]);

  const slideVariants = {
    initial: { opacity: 0, scale: 0.98, filter: "blur(5px)" },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
    exit: { opacity: 0, scale: 1.02, filter: "blur(5px)", transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
  };

  if (!isMounted) return null;

  return (
    <main className="fixed inset-0 w-screen h-screen bg-[#181A20] text-[#EAECEF] selection:bg-[#F0B90B]/25 overflow-hidden">
      
      {/* ─── Persistent Background Video Layer ─── */}
      <div className="absolute inset-0 z-0 bg-[#181A20] transition-opacity duration-1000" style={{ opacity: currentSlide === 0 ? 1 : 0.4 }}>
        <video 
          autoPlay 
          loop 
          muted 
          playsInline 
          className="w-full h-full object-cover opacity-50 mix-blend-screen"
        >
          <source src="https://videos.pexels.com/video-files/3163534/3163534-hd_1920_1080_30fps.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-[#181A20]/60 via-[#181A20]/40 to-[#181A20] z-10" />
        <div className="absolute inset-0 shadow-[inset_0_0_200px_rgba(24,26,32,1)] z-10 pointer-events-none" />
        {/* Dynamic Abstract Gold Glow that dims when leaving hero */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] md:w-[800px] md:h-[800px] bg-[#F0B90B] rounded-full blur-[150px] pointer-events-none z-10 transition-opacity duration-1000"
          style={{ opacity: currentSlide === 0 ? 0.15 : 0.05 }}
        />
      </div>

      {/* ─── Persistent Navigation ─── */}
      <motion.nav 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        className="fixed top-0 w-full z-50 flex items-center justify-between px-4 md:px-8 py-3 md:py-4 bg-transparent"
      >
        <Link href="/" className="flex items-center">
          <Image src="/logo.png" alt="Twin Grid" width={160} height={36} className="h-8 md:h-9 w-auto" priority />
        </Link>
        <div className="flex items-center gap-3 md:gap-4">
          <Link href="/auth/login" className="hidden md:block">
            <button className="px-5 py-2.5 text-sm font-semibold text-[#848E9C] hover:text-[#EAECEF] transition-colors duration-200">
              Login
            </button>
          </Link>
          <Link href="/auth/register">
            <button className="px-5 py-2 md:px-6 md:py-2.5 text-xs md:text-sm font-semibold bg-[#F0B90B] text-[#1E2026] rounded-[50px] hover:bg-[#D0980B] transition-all duration-200 shadow-[0_0_15px_rgba(240,185,11,0.3)]">
              Get Started
            </button>
          </Link>
        </div>
      </motion.nav>

      {/* ─── Premium Pagination Dots ─── */}
      <div 
        className={`hidden md:flex fixed right-3 md:right-10 top-1/2 -translate-y-1/2 z-50 flex-col gap-3 md:gap-4 transition-opacity duration-700 ${dotsVisible ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
        onMouseEnter={() => {
          setDotsVisible(true);
          if (dotsTimeoutRef.current) clearTimeout(dotsTimeoutRef.current);
        }}
        onMouseLeave={() => {
          dotsTimeoutRef.current = setTimeout(() => {
            setDotsVisible(false);
          }, 2000);
        }}
      >
        {[...Array(totalSlides)].map((_, i) => (
          <button
            key={i}
            onClick={() => {
              if (isAnimating.current) return;
              isAnimating.current = true;
              setCurrentSlide(i);
              setTimeout(() => (isAnimating.current = false), 1000);
            }}
            className="group relative flex items-center justify-center w-5 h-5 md:w-6 md:h-6 outline-none"
            aria-label={`Go to slide ${i + 1}`}
          >
            <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full transition-all duration-500 ease-out ${currentSlide === i ? 'bg-[#F0B90B] scale-150 shadow-[0_0_10px_rgba(240,185,11,0.8)]' : 'bg-[#5E6673] group-hover:bg-[#848E9C] group-hover:scale-125'}`} />
          </button>
        ))}
      </div>

      {/* ─── Content Slides ─── */}
      <div className="relative z-20 w-full h-full flex items-center justify-center pt-16 md:pt-0">
        <AnimatePresence mode="wait">
          
          {/* SLIDE 0: HERO */}
          {currentSlide === 0 && (
            <motion.div
              key="slide-0"
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute inset-0 flex flex-col items-center justify-center px-4 md:px-6 text-center"
            >
              <div className="max-w-5xl mx-auto flex flex-col items-center">
                <h1 className="text-4xl sm:text-5xl md:text-[80px] font-extrabold tracking-tight mb-4 md:mb-8 leading-[1.1] md:leading-[1.05] text-[#EAECEF] drop-shadow-2xl">
                  Trade with
                  <br />
                  <div className="h-[50px] md:h-[90px] overflow-visible inline-flex justify-center w-full">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={textIndex}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -20, opacity: 0 }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}
                        className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-[#F0B90B] to-[#F8D12F]"
                      >
                        {rotatingTexts[textIndex]}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </h1>
                <p className="text-base sm:text-lg md:text-xl text-[#848E9C] max-w-2xl leading-relaxed font-medium drop-shadow-lg px-2">
                  Deploy high-performance algorithmic bots across Binance Futures. Fully customizable AI-powered DCA and Trend Following architecture.
                </p>
                
                {/* Scroll Indicator */}
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                  className="absolute bottom-6 md:bottom-12 flex flex-col items-center gap-1 md:gap-2 text-[#5E6673] animate-bounce"
                >
                  <span className="text-[10px] md:text-xs font-semibold tracking-widest uppercase">Scroll</span>
                  <div className="w-px h-6 md:h-8 bg-gradient-to-b from-[#5E6673] to-transparent" />
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* SLIDE 1: HOW IT WORKS */}
          {currentSlide === 1 && (
            <motion.div
              key="slide-1"
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute inset-0 flex flex-col items-center justify-center px-6"
            >
              <div className="max-w-6xl mx-auto w-full flex flex-col justify-center">
                <div className="text-center mb-8 md:mb-16">
                  <h2 className="text-3xl md:text-[56px] font-extrabold text-[#EAECEF] mb-3 md:mb-6 tracking-tight drop-shadow-xl">Architecture of Profit</h2>
                  <p className="text-[#848E9C] text-sm md:text-lg font-medium max-w-2xl mx-auto">
                    Four steps to full automation. Connect, configure, analyze, and execute.
                  </p>
                </div>

                <div className="flex flex-col md:flex-row items-center md:items-stretch gap-3 md:gap-6 relative w-full">
                  {/* Desktop horizontal connecting line with traveling signal */}
                  <div className="hidden md:block absolute top-[40px] left-[12%] right-[12%] h-[2px] bg-[#2B2F36] z-0 overflow-hidden">
                     <motion.div 
                       className="absolute top-0 bottom-0 w-1/4 bg-gradient-to-r from-transparent via-[#F0B90B] to-transparent"
                       animate={{ left: ["-25%", "100%"] }}
                       transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                     />
                  </div>
                  
                  {/* Mobile vertical connecting line with traveling signal */}
                  <div className="block md:hidden absolute top-[10%] bottom-[10%] left-[35px] w-[2px] bg-[#2B2F36] z-0 overflow-hidden">
                     <motion.div 
                       className="absolute left-0 right-0 h-1/4 bg-gradient-to-b from-transparent via-[#F0B90B] to-transparent"
                       animate={{ top: ["-25%", "100%"] }}
                       transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                     />
                  </div>

                  {flowSteps.map((item, i) => {
                    const isActive = activeFlowStep === i;
                    return (
                    <div key={i} className={`relative flex flex-row md:flex-col items-center md:text-center p-4 md:p-6 rounded-2xl border transition-all duration-500 w-full md:w-1/4 bg-[#1E2026]/80 backdrop-blur-md z-10 ${isActive ? 'border-[#F0B90B] shadow-[0_0_20px_rgba(240,185,11,0.15)] md:-translate-y-2' : 'border-[#2B2F36]/50'}`}>
                      <div className={`shrink-0 w-10 h-10 md:w-20 md:h-20 rounded-full border flex items-center justify-center text-sm md:text-2xl font-extrabold mb-0 md:mb-6 mr-4 md:mr-0 transition-all duration-500 ${isActive ? 'bg-[#F0B90B] text-[#181A20] border-[#F0B90B] shadow-[0_0_20px_rgba(240,185,11,0.4)]' : 'bg-[#181A20] text-[#5E6673] border-[#2B2F36]'}`}>
                        {item.step}
                      </div>
                      <div className="text-left md:text-center flex-1">
                        <h3 className={`text-sm md:text-xl font-bold mb-1 md:mb-3 transition-colors duration-500 ${isActive ? 'text-[#F0B90B]' : 'text-[#EAECEF]'}`}>{item.title}</h3>
                        <p className="text-[#848E9C] leading-snug md:leading-relaxed text-[11px] md:text-sm font-medium">{item.desc}</p>
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            </motion.div>
          )}

          {/* SLIDE 2: FEATURES */}
          {currentSlide === 2 && (
            <motion.div
              key="slide-2"
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute inset-0 flex flex-col items-center justify-center px-4 md:px-6"
            >
              <div className="max-w-6xl mx-auto w-full">
                <div className="text-center mb-6 md:mb-12">
                  <h2 className="text-3xl md:text-[48px] font-extrabold text-[#EAECEF] tracking-tight drop-shadow-xl mb-2 md:mb-4">Enterprise Tools</h2>
                </div>

                {/* Desktop View: Show all 6 in a grid */}
                <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                  {features.map((feature, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-start p-6 rounded-2xl bg-[#1E2026]/60 backdrop-blur-xl border border-[#2B2F36] hover:border-[#F0B90B]/40 hover:shadow-[0_10px_30px_rgba(240,185,11,0.1)] transition-all duration-300 group"
                    >
                      <div className="p-3 rounded-xl bg-[#2B2F36]/80 text-[#F0B90B] mb-4 group-hover:bg-[#F0B90B] group-hover:text-[#1E2026] transition-colors duration-300">
                        <feature.icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-lg font-bold text-[#EAECEF] mb-2">{feature.title}</h3>
                      <p className="text-[#848E9C] leading-relaxed text-xs font-medium">{feature.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Mobile View: Auto-sliding 3 at a time */}
                <div className="block md:hidden relative h-[360px] w-full overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={featurePage}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                      className="absolute inset-0 flex flex-col gap-3"
                    >
                      {features.slice(featurePage * 3, featurePage * 3 + 3).map((feature, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-4 p-4 rounded-2xl bg-[#1E2026]/60 backdrop-blur-xl border border-[#2B2F36]"
                        >
                          <div className="p-2.5 rounded-lg bg-[#2B2F36]/80 text-[#F0B90B] shrink-0">
                            <feature.icon className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-[#EAECEF] mb-1">{feature.title}</h3>
                            <p className="text-[#848E9C] leading-snug text-[11px] font-medium">{feature.desc}</p>
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  </AnimatePresence>
                </div>
                
                {/* Mobile Pagination Dots */}
                <div className="flex md:hidden items-center justify-center gap-2 mt-6">
                  {[0, 1].map((page) => (
                    <button 
                      key={page}
                      onClick={() => setFeaturePage(page)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${featurePage === page ? 'w-6 bg-[#F0B90B]' : 'w-1.5 bg-[#2B2F36]'}`}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* SLIDE 3: TESTIMONIALS */}
          {currentSlide === 3 && (
            <motion.div
              key="slide-3"
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute inset-0 flex flex-col items-center justify-center px-6"
            >
              <div className="max-w-6xl mx-auto w-full">
                <div className="text-center mb-8 md:mb-12">
                  <h2 className="text-3xl md:text-[48px] font-extrabold text-[#EAECEF] tracking-tight drop-shadow-xl mb-2 md:mb-4">Trusted by Traders</h2>
                  <p className="text-[#848E9C] text-sm md:text-lg font-medium max-w-2xl mx-auto hidden sm:block">
                    Hear from the professionals scaling their portfolios with our algorithmic engine.
                  </p>
                </div>

                <div className="relative overflow-hidden w-full h-[250px] md:h-[220px]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={testiPage}
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -50 }}
                      transition={{ duration: 0.6, ease: "easeInOut" }}
                      className={`absolute inset-0 grid gap-6 ${itemsPerPage === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}
                    >
                      {testimonials.slice(testiPage * itemsPerPage, testiPage * itemsPerPage + itemsPerPage).map((item, i) => (
                        <div key={i} className="flex flex-col p-6 md:p-8 rounded-2xl bg-[#1E2026]/70 backdrop-blur-xl border border-[#2B2F36] hover:border-[#F0B90B]/30 transition-all duration-300 h-full justify-between">
                          <p className="text-[#EAECEF] leading-relaxed text-sm md:text-base font-medium italic mb-6">"{item.text}"</p>
                          <div className="flex items-center justify-between mt-auto">
                            <div>
                              <h4 className="text-sm font-bold text-[#F0B90B]">{item.name}</h4>
                              <p className="text-xs text-[#848E9C] uppercase tracking-wider mt-0.5">{item.role}</p>
                            </div>
                            <div className="flex gap-1">
                              {[...Array(5)].map((_, starIdx) => (
                                <Star key={starIdx} className="w-3.5 h-3.5 fill-[#F0B90B] text-[#F0B90B]" />
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  </AnimatePresence>
                </div>
                
                {/* Dynamic Pagination Dots for Testimonials */}
                <div className="flex items-center justify-center gap-2 mt-8">
                  {[...Array(totalTestiPages)].map((_, page) => (
                    <button 
                      key={page}
                      onClick={() => setTestiPage(page)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${testiPage === page ? 'w-6 bg-[#F0B90B]' : 'w-1.5 bg-[#2B2F36] hover:bg-[#5E6673]'}`}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* SLIDE 4: PRICING */}
          {currentSlide === 4 && (
            <motion.div
              key="slide-4"
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute inset-0 flex flex-col items-center justify-center px-4 md:px-6"
            >
              <div className="max-w-6xl mx-auto w-full">
                <div className="text-center mb-8 md:mb-10">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F0B90B]/10 border border-[#F0B90B]/20 text-[#F0B90B] text-xs font-bold mb-4 uppercase tracking-widest">
                    <Zap size={12} /> Simple, Transparent Pricing
                  </div>
                  <h2 className="text-3xl md:text-[52px] font-extrabold text-[#EAECEF] tracking-tight drop-shadow-xl mb-3">
                    Choose Your Edge
                  </h2>
                  <p className="text-[#848E9C] text-sm md:text-base max-w-xl mx-auto">
                    Billed monthly from your TwinGrid Wallet. No credit card required. Upgrade or cancel anytime.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                  {/* FREE */}
                  <div className="flex flex-col p-6 rounded-2xl bg-[#1E2026]/80 backdrop-blur-xl border border-[#2B2F36] hover:border-[#5E6673]/50 transition-all duration-300">
                    <div className="mb-5">
                      <div className="w-10 h-10 rounded-xl bg-[#2B2F36] flex items-center justify-center mb-3">
                        <Bot size={20} className="text-[#848E9C]" />
                      </div>
                      <h3 className="text-lg font-bold text-[#EAECEF]">Free</h3>
                      <div className="mt-2 flex items-end gap-1">
                        <span className="text-4xl font-extrabold text-[#EAECEF]">$0</span>
                        <span className="text-[#848E9C] text-sm mb-1.5">/month</span>
                      </div>
                      <p className="text-[10px] text-[#5E6673] mt-1">No expiry. Always free.</p>
                    </div>
                    <ul className="space-y-2.5 flex-1 text-sm">
                      <li className="flex items-center gap-2 text-[#B7BDC6]"><CheckCircle2 size={15} className="text-[#5E6673] shrink-0" />1 Binance Account</li>
                      <li className="flex items-center gap-2 text-[#B7BDC6]"><CheckCircle2 size={15} className="text-[#5E6673] shrink-0" />25% Profit Share</li>
                      <li className="flex items-center gap-2 text-[#5E6673]"><span className="w-[15px] h-[15px] shrink-0 rounded-full border border-[#2B2F36] inline-block" />Backtest Engine</li>
                      <li className="flex items-center gap-2 text-[#5E6673]"><span className="w-[15px] h-[15px] shrink-0 rounded-full border border-[#2B2F36] inline-block" />AI Strategy Builder</li>
                    </ul>
                    <Link href="/auth/register" className="mt-6 block">
                      <button className="w-full py-2.5 rounded-xl border border-[#2B2F36] text-[#848E9C] font-semibold text-sm hover:border-[#5E6673] hover:text-[#EAECEF] transition-all">
                        Get Started Free
                      </button>
                    </Link>
                  </div>

                  {/* PRO — Most Popular */}
                  <div className="relative flex flex-col p-6 rounded-2xl bg-gradient-to-b from-[#F0B90B]/10 to-[#1E2026]/80 backdrop-blur-xl border-2 border-[#F0B90B]/60 shadow-[0_0_40px_rgba(240,185,11,0.12)] transition-all duration-300 hover:shadow-[0_0_60px_rgba(240,185,11,0.2)] scale-[1.02]">
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="px-4 py-1 bg-[#F0B90B] text-[#1E2026] text-[10px] font-extrabold rounded-full uppercase tracking-widest shadow-lg">Most Popular</span>
                    </div>
                    <div className="mb-5">
                      <div className="w-10 h-10 rounded-xl bg-[#F0B90B]/20 border border-[#F0B90B]/30 flex items-center justify-center mb-3">
                        <BarChart2 size={20} className="text-[#F0B90B]" />
                      </div>
                      <h3 className="text-lg font-bold text-[#EAECEF]">Pro</h3>
                      <div className="mt-2 flex items-end gap-1">
                        <span className="text-4xl font-extrabold text-[#F0B90B]">$10</span>
                        <span className="text-[#848E9C] text-sm mb-1.5">/month</span>
                      </div>
                      <p className="text-[10px] text-[#848E9C] mt-1">Billed from TwinGrid Wallet</p>
                    </div>
                    <ul className="space-y-2.5 flex-1 text-sm">
                      <li className="flex items-center gap-2 text-[#EAECEF]"><CheckCircle2 size={15} className="text-[#0ECB81] shrink-0" />Up to 5 Binance Accounts</li>
                      <li className="flex items-center gap-2 text-[#EAECEF]"><CheckCircle2 size={15} className="text-[#0ECB81] shrink-0" />20% Profit Share</li>
                      <li className="flex items-center gap-2 text-[#EAECEF]"><CheckCircle2 size={15} className="text-[#0ECB81] shrink-0" />Backtest Engine <span className="text-[10px] text-[#F0B90B] bg-[#F0B90B]/10 px-1.5 py-0.5 rounded ml-1">5/day</span></li>
                      <li className="flex items-center gap-2 text-[#5E6673]"><span className="w-[15px] h-[15px] shrink-0 rounded-full border border-[#2B2F36] inline-block" />AI Strategy Builder</li>
                    </ul>
                    <Link href="/auth/register" className="mt-6 block">
                      <button className="w-full py-2.5 rounded-xl bg-[#F0B90B] text-[#1E2026] font-bold text-sm hover:bg-[#D0980B] transition-all shadow-[0_0_20px_rgba(240,185,11,0.3)]">
                        Start with Pro
                      </button>
                    </Link>
                  </div>

                  {/* ELITE */}
                  <div className="relative flex flex-col p-6 rounded-2xl bg-gradient-to-b from-purple-900/20 to-[#1E2026]/80 backdrop-blur-xl border border-purple-500/30 hover:border-purple-500/60 hover:shadow-[0_0_40px_rgba(168,85,247,0.15)] transition-all duration-300 overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-[60px] pointer-events-none" />
                    <div className="mb-5">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mb-3">
                        <Crown size={20} className="text-purple-400" />
                      </div>
                      <h3 className="text-lg font-bold text-[#EAECEF] flex items-center gap-2">
                        Elite <Sparkles size={14} className="text-purple-400" />
                      </h3>
                      <div className="mt-2 flex items-end gap-1">
                        <span className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">$20</span>
                        <span className="text-[#848E9C] text-sm mb-1.5">/month</span>
                      </div>
                      <p className="text-[10px] text-[#848E9C] mt-1">Billed from TwinGrid Wallet</p>
                    </div>
                    <ul className="space-y-2.5 flex-1 text-sm">
                      <li className="flex items-center gap-2 text-[#EAECEF]"><CheckCircle2 size={15} className="text-purple-400 shrink-0" />Unlimited Accounts</li>
                      <li className="flex items-center gap-2 text-[#EAECEF]"><CheckCircle2 size={15} className="text-purple-400 shrink-0" />15% Profit Share</li>
                      <li className="flex items-center gap-2 text-[#EAECEF]"><CheckCircle2 size={15} className="text-purple-400 shrink-0" />Backtest Engine <span className="text-[10px] text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded ml-1">20/day</span></li>
                      <li className="flex items-center gap-2 text-[#EAECEF]"><CheckCircle2 size={15} className="text-purple-400 shrink-0" />AI Strategy Builder</li>
                    </ul>
                    <Link href="/auth/register" className="mt-6 block">
                      <button className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 text-white font-bold text-sm hover:from-purple-500 hover:to-purple-400 transition-all shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                        Go Elite
                      </button>
                    </Link>
                  </div>
                </div>

                <p className="text-center text-[10px] text-[#5E6673] mt-6">
                  All plans include AES-256 API encryption, state healing, and 24/7 bot execution. Profit share % can be customized by admin.
                </p>
              </div>
            </motion.div>
          )}

          {/* SLIDE 5: FAQ */}
          {currentSlide === 5 && (
            <motion.div
              key="slide-5"
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute inset-0 flex flex-col items-center justify-center px-4 md:px-6"
            >
              <div className="max-w-4xl mx-auto w-full max-h-[85vh] overflow-y-auto scrollbar-hide">
                <div className="text-center mb-8 md:mb-12">
                  <h2 className="text-3xl md:text-[48px] font-extrabold text-[#EAECEF] tracking-tight drop-shadow-xl mb-2 md:mb-4">Common Questions</h2>
                  <p className="text-[#848E9C] text-sm md:text-lg font-medium max-w-xl mx-auto">
                    Everything you need to know about the product and billing.
                  </p>
                </div>

                <div className="flex flex-col gap-3 md:gap-4 w-full">
                  {faqs.map((faq, i) => (
                    <div 
                      key={i} 
                      className={`group flex flex-col rounded-2xl border transition-all duration-300 overflow-hidden ${openFaq === i ? 'bg-[#1E2026]/80 border-[#F0B90B]/50 shadow-[0_0_20px_rgba(240,185,11,0.1)] backdrop-blur-xl' : 'bg-[#1E2026]/40 border-[#2B2F36] hover:border-[#5E6673]/50 backdrop-blur-md'}`}
                    >
                      <button 
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        className="flex items-center justify-between p-4 md:p-6 w-full text-left outline-none"
                      >
                        <h3 className={`text-sm md:text-lg font-bold pr-4 transition-colors duration-300 ${openFaq === i ? 'text-[#F0B90B]' : 'text-[#EAECEF] group-hover:text-[#F0B90B]/80'}`}>
                          {faq.question}
                        </h3>
                        <div className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#181A20] border transition-all duration-300 ${openFaq === i ? 'border-[#F0B90B]/50 text-[#F0B90B] rotate-180' : 'border-[#2B2F36] text-[#848E9C]'}`}>
                          <ChevronDown className="w-4 h-4 md:w-5 md:h-5" />
                        </div>
                      </button>
                      <AnimatePresence>
                        {openFaq === i && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                          >
                            <div className="px-4 md:px-6 pb-4 md:pb-6 text-[#848E9C] text-xs md:text-sm leading-relaxed border-t border-[#2B2F36]/30 mt-2 pt-4">
                              {faq.answer}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* SLIDE 6: CTA & FOOTER */}
          {currentSlide === 6 && (
            <motion.div
              key="slide-6"
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute inset-0 flex flex-col"
            >
              <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 text-center">
                <h2 className="text-4xl md:text-[72px] font-extrabold text-[#EAECEF] mb-6 md:mb-8 drop-shadow-2xl">Ready to Automate?</h2>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-5 w-full">
                  <Link href="/auth/register">
                    <button className="h-[50px] md:h-[60px] px-8 md:px-12 text-base md:text-lg font-bold bg-[#F0B90B] text-[#1E2026] rounded-[50px] shadow-[0_0_30px_rgba(240,185,11,0.3)] hover:bg-[#D0980B] hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2">
                      Create Free Account <ArrowRight className="h-4 w-4 md:h-5 md:w-5" />
                    </button>
                  </Link>
                </div>
                <div className="mt-6 md:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-xs md:text-sm font-semibold text-[#848E9C]">
                  <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#0ECB81]" /> No Credit Card Required</span>
                  <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#0ECB81]" /> Cancel Anytime</span>
                </div>
              </div>

              {/* Minimal Footer embedded in the last slide */}
              <div className="w-full border-t border-[#2B2F36]/50 bg-[#181A20]/80 backdrop-blur-md py-4 md:py-6 px-4 md:px-6 pb-8 md:pb-6">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4">
                  <div className="flex flex-wrap justify-center items-center gap-4 md:gap-6">
                    <span className="text-[#5E6673] text-xs md:text-sm font-semibold">© {new Date().getFullYear()} Twin Grid</span>
                    <div className="hidden md:block h-4 w-px bg-[#2B2F36]" />
                    <Link href="/contact" className="text-[#848E9C] hover:text-[#F0B90B] text-xs md:text-sm font-medium transition-colors">Contact</Link>
                    <Link href="/policy" className="text-[#848E9C] hover:text-[#F0B90B] text-xs md:text-sm font-medium transition-colors">Privacy & Terms</Link>
                  </div>
                  <div className="text-[#5E6673] text-[10px] md:text-xs font-medium max-w-sm text-center md:text-right px-4 md:px-0">
                    Algorithmic trading involves significant risk. Not financial advice.
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </main>
  );
}
