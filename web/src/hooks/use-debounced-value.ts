import { useEffect, useState } from 'react'

// Evita uma requisição por tecla digitada: só propaga o valor depois de `delayMs` sem mudanças.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
