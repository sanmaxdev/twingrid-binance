"use client";

import Link from "next/link";
import { ArrowLeft, Mail, MessageSquare, Send } from "lucide-react";
import { motion } from "framer-motion";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#181A20] text-[#EAECEF] selection:bg-[#F0B90B]/25">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 flex items-center px-8 py-4 border-b border-[#2B2F36] bg-[#1E2026]/95 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2 text-[#848E9C] hover:text-[#EAECEF] transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-semibold">Back to Home</span>
        </Link>
      </nav>

      <div className="max-w-6xl mx-auto py-16 px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-[#F0B90B]/10 text-[#F0B90B] mb-6">
            <MessageSquare className="h-8 w-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-tight text-[#EAECEF]">
            Get in <span className="text-[#F0B90B]">Touch</span>
          </h1>
          <p className="text-[#848E9C] text-lg font-medium max-w-2xl mx-auto">
            Have questions about our algorithmic trading platform or need support with your bot configurations? We're here to help.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl mx-auto">
          {/* Contact Info */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col justify-center space-y-8"
          >
            <div className="bg-[#1E2026] p-8 rounded-2xl border border-[#2B2F36] shadow-[rgba(32,32,37,0.05)_0px_3px_5px_0px]">
              <h3 className="text-2xl font-bold text-[#EAECEF] mb-6">Support Channels</h3>
              
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 rounded-lg bg-[#2B2F36] text-[#F0B90B]">
                  <Mail className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-sm text-[#848E9C] font-semibold mb-1 uppercase tracking-wider">Email Support</div>
                  <a href="mailto:help@twingridbot.com" className="text-lg font-medium text-[#EAECEF] hover:text-[#F0B90B] transition-colors">
                    help@twingridbot.com
                  </a>
                  <p className="text-sm text-[#5E6673] mt-1">24/7 technical and billing support.</p>
                </div>
              </div>

              <div className="pt-6 border-t border-[#2B2F36]">
                <p className="text-[#848E9C] text-sm leading-relaxed">
                  For immediate assistance with active trades, please log in to your dashboard and use the emergency kill-switch functionality. 
                  For API integration questions, please ensure you include your workspace ID in your email.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Contact Form */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-[#1E2026] p-8 rounded-2xl border border-[#2B2F36] relative overflow-hidden"
          >
            {/* Glass glow */}
            <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-[#F0B90B]/10 rounded-full blur-[60px] pointer-events-none" />

            <form className="relative z-10 flex flex-col space-y-5" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label className="block text-sm font-semibold text-[#848E9C] mb-2">Name</label>
                <input 
                  type="text" 
                  placeholder="John Doe"
                  className="w-full bg-[#181A20] border border-[#2B2F36] text-[#EAECEF] rounded-lg px-4 py-3 focus:border-[#F0B90B] focus:ring-1 focus:ring-[#F0B90B] outline-none transition-all placeholder:text-[#5E6673]"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-[#848E9C] mb-2">Email</label>
                <input 
                  type="email" 
                  placeholder="john@example.com"
                  className="w-full bg-[#181A20] border border-[#2B2F36] text-[#EAECEF] rounded-lg px-4 py-3 focus:border-[#F0B90B] focus:ring-1 focus:ring-[#F0B90B] outline-none transition-all placeholder:text-[#5E6673]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#848E9C] mb-2">Message</label>
                <textarea 
                  rows={4}
                  placeholder="How can we help you?"
                  className="w-full bg-[#181A20] border border-[#2B2F36] text-[#EAECEF] rounded-lg px-4 py-3 focus:border-[#F0B90B] focus:ring-1 focus:ring-[#F0B90B] outline-none transition-all placeholder:text-[#5E6673] resize-none"
                ></textarea>
              </div>

              <button className="mt-2 w-full flex items-center justify-center gap-2 px-6 py-4 text-sm font-semibold bg-[#F0B90B] text-[#1E2026] rounded-[6px] hover:bg-[#D0980B] transition-all duration-200">
                Send Message <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 border-t border-[#2B2F36] bg-[#1E2026] text-center mt-12">
        <p className="text-[#5E6673] text-sm font-medium">© {new Date().getFullYear()} Twin Grid Console. All rights reserved.</p>
      </footer>
    </main>
  );
}
