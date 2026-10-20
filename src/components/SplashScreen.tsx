import { motion } from 'framer-motion'

export function SplashScreen() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: '#3d7cc9' }}
    >
      {/* Outer pulsing ring */}
      <motion.div
        className="absolute rounded-full border-2 border-white/20"
        initial={{ width: 140, height: 140, opacity: 0.6 }}
        animate={{ width: 200, height: 200, opacity: 0 }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: 0 }}
      />
      {/* Second pulsing ring */}
      <motion.div
        className="absolute rounded-full border-2 border-white/20"
        initial={{ width: 140, height: 140, opacity: 0.6 }}
        animate={{ width: 200, height: 200, opacity: 0 }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
      />

      {/* USDC logo circle */}
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative flex items-center justify-center"
        style={{
          width: 140,
          height: 140,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          border: '2.5px solid rgba(255,255,255,0.9)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}
      >
        {/* USDC icon — SVG matching the image */}
        <motion.svg
          viewBox="0 0 64 64"
          width={72}
          height={72}
          fill="none"
          initial={{ rotate: -20, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
        >
          {/* Arc left */}
          <path
            d="M18 32 C18 22 24 14 32 12"
            stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none"
          />
          {/* Arc right */}
          <path
            d="M46 32 C46 42 40 50 32 52"
            stroke="white" strokeWidth="3.5" strokeLinecap="round" fill="none"
          />
          {/* Dollar sign */}
          <text
            x="32" y="38"
            textAnchor="middle"
            fontSize="22"
            fontWeight="bold"
            fill="white"
            fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
          >$</text>
        </motion.svg>
      </motion.div>

      {/* Brand name */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="mt-8 text-center"
      >
        <div
          style={{
            color: 'white',
            fontSize: 32,
            fontWeight: 300,
            letterSpacing: '0.01em',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          ArcPay Global
        </div>
      </motion.div>

      {/* Tagline */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 0.7, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        style={{ color: 'white', fontSize: 13, marginTop: 8, letterSpacing: '0.04em' }}
      >
        USDC Point of Sale
      </motion.div>
    </motion.div>
  )
}
