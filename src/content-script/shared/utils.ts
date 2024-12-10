export function throttle(func: (...args: any[]) => void, limit: number): (...args: any[]) => void {
  let lastFunc: ReturnType<typeof setTimeout> | null = null;
  let lastRan: number | null = null;

  return (...args: any[]) => {
      const now = Date.now();

      if (lastRan === null || now - lastRan >= limit) {
          func(...args);
          lastRan = now;
      } else if (lastFunc === null) {
          lastFunc = setTimeout(() => {
              func(...args);
              lastRan = Date.now();
              lastFunc = null;
          }, limit - (now - lastRan));
      }
  };
}