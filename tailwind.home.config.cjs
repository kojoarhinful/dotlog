/** Only the home page uses Tailwind. The app ships its own stylesheet.
 *  Utilities are scoped under `.home` so they cannot touch the app. */
module.exports = {
  content: ['./src/pages/Home.tsx'],
  important: '.home',
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        ink: '#1B1B1B',
        paper: '#FFF8EC',
        dim: '#8E8E88',
        sun: '#FFD23F',
      },
      fontFamily: {
        fat: ['"Bagel Fat One"', 'cursive'],
        jakarta: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        round: ['Fredoka', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
}
