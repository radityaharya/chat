import { useEffect } from 'react';

/**
 * Custom hook to handle dynamic viewport height on mobile devices.
 * Sets a CSS custom property --vh that accounts for browser chrome and keyboard.
 * Use calc(var(--vh, 1vh) * 100) instead of 100vh in your CSS.
 */
export function useViewportHeight() {
  useEffect(() => {
    const setVH = () => {
      // Get the actual viewport height
      const vh = window.innerHeight * 0.01;
      // Set the CSS custom property
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };

    // Set initial value
    setVH();

    // Update on resize (includes orientation change and keyboard appearance)
    let timeoutId: NodeJS.Timeout;
    const handleResize = () => {
      // Debounce to avoid excessive updates
      clearTimeout(timeoutId);
      timeoutId = setTimeout(setVH, 100);
    };

    window.addEventListener('resize', handleResize);
    // Also listen to orientationchange for better mobile support
    window.addEventListener('orientationchange', setVH);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', setVH);
      clearTimeout(timeoutId);
    };
  }, []);
}
