/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        accent: '#54a9eb',
        'accent-hover': '#4a99d6',
        'bg-app': '#ffffff',
        'bg-sidebar': '#ffffff',
        'bg-chat': '#e6ebee',
        'bg-bubble-own': '#effdde',
        'bg-bubble-other': '#ffffff',
        border: '#e5e7eb',
        'text-primary': '#000000',
        'text-secondary': '#707579',
        online: '#4fae4e',
      },
    },
  },
};
