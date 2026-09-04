/** Coquille applicative en construction : remplacée par l'agent « shell ». */
import { useEffect } from 'react';
import { useGameStore } from '@/state';

export function App(): React.JSX.Element {
  const bootstrap = useGameStore((s) => s.bootstrap);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);
  return <div data-stub="App" />;
}
